import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session";
import { getRequestFile, requestIdOfFile } from "@/lib/db";
import { canAccessRequest } from "@/lib/requestAccess";

export const runtime = "nodejs";

/** 添付資料のダウンロード（申請詳細・単価履歴から開く） */
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

  return new NextResponse(new Uint8Array(file.data), {
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
