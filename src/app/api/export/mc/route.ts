import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session";
import { listExportableLines, markExported } from "@/lib/db";
import { toMcCsv } from "@/lib/mc";
import { todayJST } from "@/lib/format";

export const runtime = "nodejs";

/**
 * MC取込CSV（mcframe 購買単価取込フォーマット）の出力。
 * POST { lineIds: string[], markExported: boolean } → CSV を返す。
 * 出力後は該当明細に出力済み日時を記録できる（再出力も可能）。
 */
export async function POST(req: Request) {
  const session = await getSessionWithRole();
  if (!session?.companyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "MC出力は管理者のみ実行できます" }, { status: 403 });
  }

  let body: { lineIds?: unknown; markExported?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const lineIds = Array.isArray(body.lineIds)
    ? (body.lineIds.filter((x) => typeof x === "string") as string[])
    : [];
  if (lineIds.length === 0) {
    return NextResponse.json({ error: "出力する明細を選択してください" }, { status: 400 });
  }

  try {
    // 承認済み明細のみが対象（listExportableLines は approved のみ返す）
    const all = await listExportableLines(session.companyId, { includeExported: true, limit: 5000 });
    const selected = all.filter((l) => lineIds.includes(l.id));
    if (selected.length === 0) {
      return NextResponse.json({ error: "対象の承認済み明細が見つかりません" }, { status: 404 });
    }
    const csv = toMcCsv(selected);
    if (body.markExported === true) {
      await markExported(session.companyId, selected.map((l) => l.id));
    }
    const fileName = `MC取込_購買単価_${todayJST().replace(/-/g, "")}.csv`;
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[export/mc]", e);
    return NextResponse.json({ error: "出力に失敗しました" }, { status: 500 });
  }
}
