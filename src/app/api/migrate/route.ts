import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session";
import { insertHistoryBatch, type MigrationRow } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 単価履歴の移行取込（バッチ）。
 * mcframe からエクスポートした単価情報（CSV化したもの）を、画面側で分割して
 * { rows: MigrationRow[] } として順次 POST する。冪等（同一キー＋開始日はスキップ）。
 */
export async function POST(req: Request) {
  const session = await getSessionWithRole();
  if (!session?.companyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "データ移行は管理者のみ実行できます" }, { status: 403 });
  }

  let body: { rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const raw = Array.isArray(body.rows) ? body.rows : [];
  if (raw.length === 0) return NextResponse.json({ inserted: 0, skipped: 0 });
  if (raw.length > 2000) {
    return NextResponse.json({ error: "1回の送信は2000行までにしてください" }, { status: 413 });
  }

  // 型を安全側に正規化（クライアント整形済みだがサーバでも検証）
  const s = (v: unknown): string | null => {
    const t = typeof v === "string" ? v.trim() : "";
    return t === "" || t === "*" ? null : t;
  };
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const date = (v: unknown): string | null => {
    const t = typeof v === "string" ? v.trim() : "";
    const m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return null;
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  };

  const rows: MigrationRow[] = [];
  let invalid = 0;
  for (const r of raw as Array<Record<string, unknown>>) {
    const itemCd = s(r.item_cd);
    const supplierCd = s(r.supplier_cd);
    const startDate = date(r.start_date);
    const price = num(r.price);
    if (!itemCd || !supplierCd || !startDate || price == null) {
      invalid++;
      continue;
    }
    rows.push({
      item_cd: itemCd,
      item_branch: s(r.item_branch),
      supplier_cd: supplierCd,
      unit_cd: s(r.unit_cd),
      lot_qty: num(r.lot_qty),
      currency: s(r.currency),
      loc_cd: s(r.loc_cd),
      dlv_cd: s(r.dlv_cd),
      wg_cd: s(r.wg_cd),
      start_date: startDate,
      end_date: date(r.end_date),
      price,
      price_before: num(r.price_before),
      memo1: s(r.memo1),
      memo2: s(r.memo2),
      memo3: s(r.memo3),
    });
  }

  try {
    const inserted = await insertHistoryBatch(session.companyId, rows);
    return NextResponse.json({
      inserted,
      skipped: rows.length - inserted,
      invalid,
    });
  } catch (e) {
    console.error("[migrate]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "移行取込に失敗しました" },
      { status: 500 }
    );
  }
}
