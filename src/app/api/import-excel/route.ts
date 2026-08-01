import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSessionWithRole } from "@/lib/session";
import { createRequest, upsertItem, upsertSupplier } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import type { LineInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * 一括取込（Excel/CSV）。multipart/form-data で file と kind を受け取る。
 * - kind=prices    … 単価申請の一括取込（1ファイル → 1申請の下書き）
 * - kind=items     … 品番マスタの一括登録（upsert）
 * - kind=suppliers … 取引先マスタの一括登録（upsert）
 * 1行目はヘッダ（テンプレートは /api/import-excel?template=... でダウンロード）。
 */

const PRICE_HEADERS = [
  "品目CD", "枝番", "品名", "発注先CD", "発注先名", "納入場所CD", "納入場所名",
  "納品先CD", "納品先名", "単位CD", "ロット数", "通貨", "適用開始日", "適用終了日",
  "現行単価", "購入単価", "有償支給価格",
  "支給材建値", "材料建値", "単価改定", "設計変更", "為替変動", "その他", "備考",
];
const ITEM_HEADERS = ["品目CD", "枝番", "品名", "単位CD", "仕入税CD", "備考"];
const SUPPLIER_HEADERS = ["発注先CD", "発注先名", "備考"];

/** テンプレートCSVのダウンロード */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const template = url.searchParams.get("template");
  const headers =
    template === "items" ? ITEM_HEADERS : template === "suppliers" ? SUPPLIER_HEADERS : PRICE_HEADERS;
  const name =
    template === "items" ? "品番マスタ取込" : template === "suppliers" ? "取引先マスタ取込" : "単価申請取込";
  const bom = String.fromCharCode(0xfeff);
  return new NextResponse(bom + headers.join(",") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.csv`,
      "Cache-Control": "no-store",
    },
  });
}

/** セル値を文字列化（Excel の日付・数値・リッチテキスト対応） */
/* eslint-disable @typescript-eslint/no-explicit-any */
function cellStr(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  if (typeof v === "object") {
    if (typeof v.text === "string") return v.text.trim();
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join("").trim();
    if (v.result != null) return cellStr(v.result);
    return "";
  }
  return String(v).trim();
}

/** 日付文字列の正規化（YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD 対応） */
function normDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function toNum(s: string): number | null {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** ファイル → 行列（xlsx は先頭シート、csv/tsv はテキスト） */
async function fileToRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    const text = await file.text();
    return parseCsv(text);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const arr: string[] = [];
    // exceljs の values は1始まり
    const values = row.values as any[];
    for (let c = 1; c < values.length; c++) arr.push(cellStr(values[c]));
    rows.push(arr);
  });
  return rows;
}

/** ヘッダ行から列名→index のマップを作る */
function headerMap(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => m.set(h.trim(), i));
  return m;
}

export async function POST(req: Request) {
  const session = await getSessionWithRole();
  if (!session?.companyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "一括取込は管理者のみ実行できます" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "prices");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ファイルを選択してください" }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json(
      { error: "ファイルが大きすぎます（4MBまで）。大量データはデータ移行または分割取込をご利用ください。" },
      { status: 413 }
    );
  }

  let rows: string[][];
  try {
    rows = await fileToRows(file);
  } catch (e) {
    console.error("[import-excel] parse", e);
    return NextResponse.json({ error: "ファイルを読み込めませんでした（xlsx/csv形式）" }, { status: 422 });
  }
  if (rows.length < 2) {
    return NextResponse.json({ error: "データ行がありません（1行目はヘッダ）" }, { status: 422 });
  }

  const h = headerMap(rows[0]);
  const get = (row: string[], col: string) => {
    const i = h.get(col);
    return i == null ? "" : (row[i] ?? "").trim();
  };
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));

  try {
    if (kind === "items") {
      if (!h.has("品目CD")) {
        return NextResponse.json({ error: "ヘッダに「品目CD」がありません。テンプレートをご利用ください。" }, { status: 422 });
      }
      let count = 0;
      for (const r of dataRows) {
        const code = get(r, "品目CD");
        if (!code) continue;
        await upsertItem(session.companyId, {
          code,
          branch: get(r, "枝番") || null,
          name: get(r, "品名"),
          unitCd: get(r, "単位CD") || null,
          taxCd: get(r, "仕入税CD") || null,
          notes: get(r, "備考") || null,
        });
        count++;
      }
      return NextResponse.json({ ok: true, kind, count });
    }

    if (kind === "suppliers") {
      if (!h.has("発注先CD")) {
        return NextResponse.json({ error: "ヘッダに「発注先CD」がありません。テンプレートをご利用ください。" }, { status: 422 });
      }
      let count = 0;
      for (const r of dataRows) {
        const code = get(r, "発注先CD");
        if (!code) continue;
        await upsertSupplier(session.companyId, {
          code,
          name: get(r, "発注先名"),
          notes: get(r, "備考") || null,
        });
        count++;
      }
      return NextResponse.json({ ok: true, kind, count });
    }

    // kind=prices: 単価申請の一括取込（下書き作成）
    if (!h.has("品目CD") || !h.has("発注先CD") || !h.has("購入単価")) {
      return NextResponse.json(
        { error: "ヘッダに「品目CD」「発注先CD」「購入単価」が必要です。テンプレートをご利用ください。" },
        { status: 422 }
      );
    }
    const lines: LineInput[] = [];
    const errors: string[] = [];
    dataRows.forEach((r, i) => {
      const itemCd = get(r, "品目CD");
      const supplierCd = get(r, "発注先CD");
      if (!itemCd && !supplierCd) return;
      const newPrice = toNum(get(r, "購入単価"));
      const startDate = normDate(get(r, "適用開始日"));
      if (!itemCd) errors.push(`${i + 2}行目: 品目CDがありません`);
      else if (!supplierCd) errors.push(`${i + 2}行目: 発注先CDがありません`);
      else if (newPrice == null) errors.push(`${i + 2}行目: 購入単価が数値ではありません`);
      else if (!startDate) errors.push(`${i + 2}行目: 適用開始日が不正です（YYYY/MM/DD）`);
      else {
        lines.push({
          itemCd,
          itemBranch: get(r, "枝番") || null,
          itemName: get(r, "品名") || null,
          supplierCd,
          supplierName: get(r, "発注先名") || null,
          locCd: get(r, "納入場所CD") || null,
          locName: get(r, "納入場所名") || null,
          dlvCd: get(r, "納品先CD") || null,
          dlvName: get(r, "納品先名") || null,
          unitCd: get(r, "単位CD") || null,
          lotQty: toNum(get(r, "ロット数")),
          currency: get(r, "通貨") || "JPY",
          startDate,
          endDate: normDate(get(r, "適用終了日")),
          currentPrice: toNum(get(r, "現行単価")),
          newPrice,
          paidSupplyPrice: toNum(get(r, "有償支給価格")),
          bdSupplyMat: toNum(get(r, "支給材建値")),
          bdMaterial: toNum(get(r, "材料建値")),
          bdRevision: toNum(get(r, "単価改定")),
          bdDesign: toNum(get(r, "設計変更")),
          bdForex: toNum(get(r, "為替変動")),
          bdOther: toNum(get(r, "その他")),
          reasonNote: get(r, "備考") || null,
        });
      }
    });
    if (lines.length === 0) {
      return NextResponse.json(
        { error: `取込できる行がありません。${errors.slice(0, 5).join(" / ")}` },
        { status: 422 }
      );
    }
    // parseOnly: 申請は作らず、解析した明細だけを返す（申請フォームの一括入力タブ用）
    if (String(form.get("parseOnly") ?? "") === "1") {
      return NextResponse.json({ ok: true, kind, count: lines.length, lines, errors });
    }
    const requestId = await createRequest(
      session.companyId,
      { title: `一括取込（${file.name}）`, lines },
      { loginId: session.loginId, name: session.userName }
    );
    return NextResponse.json({ ok: true, kind, count: lines.length, requestId, errors });
  } catch (e) {
    console.error("[import-excel]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取込に失敗しました" },
      { status: 500 }
    );
  }
}
