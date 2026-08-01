import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSessionWithRole } from "@/lib/session";
import {
  createRequest,
  upsertItemsBatch,
  upsertSupplier,
  employeeNameMap,
  applyHistoryReasons,
  setSupplierContacts,
  splitContactNames,
  normalizeName,
} from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import type { ItemInput as ItemRowInput } from "@/lib/db";
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
  "品目CD", "枝番", "品名", "取引先CD", "取引先名", "納入場所CD", "納入場所名",
  "納品先CD", "納品先名", "単位CD", "ロット数", "通貨", "適用開始日", "適用終了日",
  "現行単価", "購入単価", "有償支給価格", "月当たり数量",
  "支給材建値", "材料建値", "単価改定", "設計変更", "為替変動", "その他", "備考",
];
const ITEM_HEADERS = [
  "品目CD", "品名", "単位ＣＤ", "科目", "科目名", "科目内訳",
  "借方ICS科目名（製造）", "品目区分", "材料区分", "枝番", "仕入税CD", "備考",
];
const SUPPLIER_HEADERS = ["取引先CD", "取引先名", "担当バイヤー社員番号", "備考"];
const CONTACT_HEADERS = ["取引先CD", "取引先名", "企画グループ", "管理グループ"];
const REASON_HEADERS = [
  "取引先CD", "取引先名", "品目CD", "品名", "開始日", "納入場所CD",
  "材料建値", "単価改定", "設計変更", "為替変動", "その他", "備考", "出力社員名",
];

const TEMPLATES: Record<string, { headers: string[]; name: string }> = {
  items: { headers: ITEM_HEADERS, name: "品番マスタ取込" },
  suppliers: { headers: SUPPLIER_HEADERS, name: "取引先マスタ取込" },
  "supplier-contacts": { headers: CONTACT_HEADERS, name: "取引先担当窓口取込" },
  "history-reasons": { headers: REASON_HEADERS, name: "単価改訂履歴の理由取込" },
  prices: { headers: PRICE_HEADERS, name: "単価申請取込" },
};

/** テンプレートCSVのダウンロード */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const template = url.searchParams.get("template") ?? "prices";
  const { headers, name } = TEMPLATES[template] ?? TEMPLATES.prices;
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

/**
 * ファイル → 行列（csv/tsv はテキスト、xlsx はシートを選んで読む）。
 * xlsx は sheetHints に一致する名前のシートを優先し、無ければ先頭シート
 * （社員一覧・取引先CDと窓口一覧などが1つのブックに同梱されていても取り込める）。
 */
async function fileToRows(file: File, sheetHints: string[] = []): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    const text = await file.text();
    return parseCsv(text);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws =
    wb.worksheets.find((w) => sheetHints.some((hint) => w.name.includes(hint))) ?? wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const arr: string[] = [];
    // exceljs の values は1始まり（空セルは undefined で位置が保たれる）
    const values = row.values as any[];
    for (let c = 1; c < values.length; c++) arr.push(cellStr(values[c]));
    rows.push(arr);
  });
  return rows;
}

/**
 * ヘッダ行の位置を探す（表の上に空行やタイトル行がある実データに対応）。
 * 先頭10行のうち、必須列のいずれかを含む最初の行をヘッダとみなす。
 */
function dropRowsBeforeHeader(rows: string[][], anyOf: string[]): string[][] {
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    if (rows[i].some((c) => anyOf.includes(c.trim()))) return rows.slice(i);
  }
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

  // 種類ごとの想定シート名とキー列（実データのブック構成に合わせる）
  const SHEET_HINTS: Record<string, string[]> = {
    "supplier-contacts": ["取引先CDと窓口一覧", "窓口"],
  };
  const KEY_COLS: Record<string, string[]> = {
    "history-reasons": ["品目CD"],
    items: ["品目CD"],
    suppliers: ["取引先CD", "発注先CD"],
    "supplier-contacts": ["取引先CD", "発注先CD"],
    prices: ["品目CD"],
  };

  let rows: string[][];
  try {
    rows = await fileToRows(file, SHEET_HINTS[kind] ?? []);
  } catch (e) {
    console.error("[import-excel] parse", e);
    return NextResponse.json({ error: "ファイルを読み込めませんでした（xlsx/csv形式）" }, { status: 422 });
  }
  rows = dropRowsBeforeHeader(rows, KEY_COLS[kind] ?? KEY_COLS.prices);
  if (rows.length < 2) {
    return NextResponse.json({ error: "データ行がありません（1行目はヘッダ）" }, { status: 422 });
  }

  const h = headerMap(rows[0]);
  const get = (row: string[], ...cols: string[]) => {
    for (const col of cols) {
      const i = h.get(col);
      if (i != null) return (row[i] ?? "").trim();
    }
    return "";
  };
  /** 旧テンプレート（発注先CD/発注先名）も受け付ける */
  const hasCol = (...cols: string[]) => cols.some((c) => h.has(c));
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));

  try {
    if (kind === "items") {
      if (!h.has("品目CD")) {
        return NextResponse.json({ error: "ヘッダに「品目CD」がありません。テンプレートをご利用ください。" }, { status: 422 });
      }
      // 「単位ＣＤ」(全角) と「単位CD」(半角) のどちらの表記でも受け付ける
      const unitCol = h.has("単位ＣＤ") ? "単位ＣＤ" : "単位CD";
      // 同じ品目CDが品目区分違いで複数行あるため、区分はまとめて（例: 3/7）保持する
      const merged = new Map<string, ItemRowInput>();
      const classes = new Map<string, Set<string>>();
      for (const r of dataRows) {
        const code = get(r, "品目CD");
        if (!code) continue;
        const branch = get(r, "枝番") || null;
        const key = `${code}\u0000${branch ?? ""}`;
        const cls = get(r, "品目区分");
        if (cls) {
          const set = classes.get(key) ?? new Set<string>();
          set.add(cls);
          classes.set(key, set);
        }
        const prev = merged.get(key);
        const pick = (cur: string | null | undefined, next: string) => (next ? next : (cur ?? null));
        merged.set(key, {
          code,
          branch,
          name: pick(prev?.name, get(r, "品名")) ?? "",
          unitCd: pick(prev?.unitCd, get(r, unitCol)),
          taxCd: pick(prev?.taxCd, get(r, "仕入税CD")),
          notes: pick(prev?.notes, get(r, "備考")),
          acctCd: pick(prev?.acctCd, get(r, "科目")),
          acctName: pick(prev?.acctName, get(r, "科目名")),
          acctDetail: pick(prev?.acctDetail, get(r, "科目内訳")),
          icsName: pick(prev?.icsName, get(r, "借方ICS科目名（製造）", "借方ICS科目名(製造)")),
          itemClass: null,
          materialClass: pick(prev?.materialClass, get(r, "材料区分")),
        });
      }
      for (const [key, v] of merged) {
        const set = classes.get(key);
        v.itemClass = set && set.size > 0 ? [...set].sort().join("/") : null;
      }
      const payload = [...merged.values()];
      const skipped = dataRows.filter((r) => get(r, "品目CD")).length - payload.length;
      const count = await upsertItemsBatch(session.companyId, payload);
      return NextResponse.json({
        ok: true,
        kind,
        count,
        errors:
          skipped > 0
            ? [`同じ品目CDの行が ${skipped.toLocaleString()} 件ありました（品目区分は「3/7」のようにまとめて登録しています）`]
            : [],
      });
    }

    if (kind === "suppliers") {
      if (!hasCol("取引先CD", "発注先CD")) {
        return NextResponse.json({ error: "ヘッダに「取引先CD」がありません。テンプレートをご利用ください。" }, { status: 422 });
      }
      let count = 0;
      for (const r of dataRows) {
        const code = get(r, "取引先CD", "発注先CD");
        if (!code) continue;
        await upsertSupplier(session.companyId, {
          code,
          name: get(r, "取引先名", "取引先名"),
          notes: get(r, "備考") || null,
          buyerLoginId: get(r, "担当バイヤー社員番号") || null,
        });
        count++;
      }
      return NextResponse.json({ ok: true, kind, count });
    }

    if (kind === "supplier-contacts") {
      if (!hasCol("取引先CD", "発注先CD")) {
        return NextResponse.json(
          { error: "ヘッダに「取引先CD」がありません。テンプレートをご利用ください。" },
          { status: 422 }
        );
      }

      const byName = await employeeNameMap(session.companyId);
      // 氏名 → 社員番号。社員マスタに無い氏名は未解決として報告する
      const unresolved = new Set<string>();
      const resolve = (name: string): string | null => {
        const n = normalizeName(name);
        if (!n) return null;
        const id = byName.get(n) ?? byName.get(n.replace(/ /g, "")) ?? null;
        if (!id) unresolved.add(n);
        return id;
      };
      const payload = dataRows
        .map((r) => {
          const code = get(r, "取引先CD", "発注先CD");
          if (!code) return null;
          const plan = splitContactNames(get(r, "企画グループ"));
          const mgmt = splitContactNames(get(r, "管理グループ"));
          return {
            code,
            name: get(r, "取引先名") || null,
            buyerLoginId: resolve(plan.main),
            buyerSubLoginId: plan.sub ? resolve(plan.sub) : null,
            chaserLoginId: resolve(mgmt.main),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r != null);
      const res = await setSupplierContacts(session.companyId, payload);
      return NextResponse.json({
        ok: true,
        kind,
        count: payload.length,
        created: res.created,
        updated: res.updated,
        errors: unresolved.size
          ? [`社員マスタに見つからない氏名: ${[...unresolved].slice(0, 10).join("・")}${unresolved.size > 10 ? " ほか" : ""}`]
          : [],
      });
    }

    if (kind === "history-reasons") {
      if (!h.has("品目CD") || !hasCol("取引先CD", "発注先CD") || !h.has("開始日")) {
        return NextResponse.json(
          { error: "ヘッダに「品目CD」「取引先CD」「開始日」が必要です。" },
          { status: 422 }
        );
      }
      const payload = dataRows
        .map((r) => ({
          itemCd: get(r, "品目CD"),
          itemName: get(r, "品名") || null,
          supplierCd: get(r, "取引先CD", "発注先CD"),
          supplierName: get(r, "取引先名") || null,
          locCd: get(r, "納入場所CD") || null,
          startDate: normDate(get(r, "開始日")),
          reason: get(r, "備考") || null,
          bdMaterial: toNum(get(r, "材料建値")),
          bdRevision: toNum(get(r, "単価改定")),
          bdDesign: toNum(get(r, "設計変更")),
          bdForex: toNum(get(r, "為替変動")),
          bdOther: toNum(get(r, "その他")),
          applicantName: get(r, "出力社員名") || null,
        }))
        // 内訳も備考も無い行は反映するものが無いので除く（同一キーの空行で上書きしない）
        .filter(
          (r) =>
            r.itemCd &&
            r.supplierCd &&
            r.startDate &&
            (r.reason ||
              r.itemName ||
              [r.bdMaterial, r.bdRevision, r.bdDesign, r.bdForex, r.bdOther].some((v) => v != null))
        )
        .map((r) => ({ ...r, startDate: r.startDate as string }));
      if (payload.length === 0) {
        return NextResponse.json({ error: "反映できる行がありません（備考・内訳が空の行のみ）" }, { status: 422 });
      }
      const res = await applyHistoryReasons(session.companyId, payload);
      return NextResponse.json({
        ok: true,
        kind,
        count: res.updated,
        itemNames: res.itemNames,
        supplierNames: res.supplierNames,
        errors:
          res.unmatched > 0
            ? [`単価履歴に一致しなかった行が ${res.unmatched.toLocaleString()} 件あります（品目CD・取引先CD・納入場所CD・開始日で照合）`]
            : [],
      });
    }

    // kind=prices: 単価申請の一括取込（下書き作成）
    if (!h.has("品目CD") || !hasCol("取引先CD", "発注先CD") || !h.has("購入単価")) {
      return NextResponse.json(
        { error: "ヘッダに「品目CD」「取引先CD」「購入単価」が必要です。テンプレートをご利用ください。" },
        { status: 422 }
      );
    }
    const lines: LineInput[] = [];
    const errors: string[] = [];
    dataRows.forEach((r, i) => {
      const itemCd = get(r, "品目CD");
      const supplierCd = get(r, "取引先CD", "発注先CD");
      if (!itemCd && !supplierCd) return;
      const newPrice = toNum(get(r, "購入単価"));
      const startDate = normDate(get(r, "適用開始日"));
      if (!itemCd) errors.push(`${i + 2}行目: 品目CDがありません`);
      else if (!supplierCd) errors.push(`${i + 2}行目: 取引先CDがありません`);
      else if (newPrice == null) errors.push(`${i + 2}行目: 購入単価が数値ではありません`);
      else if (!startDate) errors.push(`${i + 2}行目: 適用開始日が不正です（YYYY/MM/DD）`);
      else {
        lines.push({
          itemCd,
          itemBranch: get(r, "枝番") || null,
          itemName: get(r, "品名") || null,
          supplierCd,
          supplierName: get(r, "取引先名") || null,
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
          monthlyQty: toNum(get(r, "月当たり数量", "月数量")),
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
