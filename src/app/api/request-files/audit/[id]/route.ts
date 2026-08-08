import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session";
import { getPurgedFile } from "@/lib/db";
import { fetchPrivateBlob } from "@/lib/privateBlob";

export const runtime = "nodejs";

/**
 * 申請（下書き）ごと削除された添付のダウンロード（管理者のみ・電帳法対応）。
 * 申請の行は残っていないため、監査ログ（request_file_audit）に控えた
 * 実体の所在から取得して中継する。URL はブラウザへ返さない。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithRole();
  if (!session?.companyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "この操作は管理者のみ利用できます" }, { status: 403 });
  }
  const { id } = await params;
  const file = await getPurgedFile(session.companyId, id);
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!file.blobUrl) {
    return NextResponse.json(
      { error: "このファイルは本体がDB保存（Blob移行前）だったため、申請の削除と同時に失われています" },
      { status: 410 }
    );
  }
  let body: Buffer | null = null;
  try {
    body = await fetchPrivateBlob(file.blobUrl);
  } catch (e) {
    console.error("[request-files/audit] blob fetch failed:", e);
  }
  if (!body) {
    return NextResponse.json({ error: "ファイル本体を取得できませんでした" }, { status: 502 });
  }
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${
        /^(application\/pdf|image\/)/.test(file.contentType) ? "inline" : "attachment"
      }; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
