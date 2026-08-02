import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session";
import { getRequestFile, requestIdOfFile } from "@/lib/db";
import { canAccessRequest } from "@/lib/requestAccess";
import { fetchPrivateBlob } from "@/lib/privateBlob";

export const runtime = "nodejs";

/**
 * 添付資料のダウンロード（申請詳細・単価履歴から開く）。
 *
 * 実体は Private Blob にあるが、URL は決してブラウザへ返さない。
 * ここで権限を確認したうえでサーバーが取得して中継する。
 * これにより、Blob 移行前と同じアクセス制御が保たれる。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole();
  if (!session?.companyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const requestId = await requestIdOfFile(session.companyId, id);
  if (!requestId) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canAccessRequest(session, requestId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const file = await getRequestFile(session.companyId, id);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });

  // blob_url があれば Blob から、無ければ移行前の既存レコードなので DB の data から
  let body: Buffer | null = file.data;
  if (file.blobUrl) {
    try {
      body = await fetchPrivateBlob(file.blobUrl);
    } catch (e) {
      console.error("[request-files] blob fetch failed:", e);
      body = null;
    }
  }
  if (!body) {
    return NextResponse.json({ error: "ファイル本体を取得できませんでした" }, { status: 502 });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": file.contentType,
      // PDF・画像はブラウザで開き、それ以外はダウンロード
      "Content-Disposition": `${
        /^(application\/pdf|image\/)/.test(file.contentType) ? "inline" : "attachment"
      }; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
