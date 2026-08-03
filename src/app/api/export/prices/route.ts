import { requireSession, supplierScopeOf } from "@/lib/session";
import {
  listPrices,
  PRICE_FACTORS,
  PRICE_SORT_DEFAULT,
  type PriceFactor,
  type PriceSort,
} from "@/lib/db";
import type { PriceHistoryRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 単価履歴のCSV書き出し。
 * 画面（/prices）と同じ絞り込み・並び替えで、表示中の条件に一致する**全件**を出力する。
 * 21万行規模でも詰まらないよう、ページごとに読みながら少しずつ送り出す。
 * 文字コードは UTF-8（BOM付き）で、Excel でそのまま開ける。
 */

const HEADERS = [
  "品目CD",
  "枝番",
  "品名",
  "取引先CD",
  "取引先名",
  "納入場所CD",
  "納入場所名",
  "納品先CD",
  "単位",
  "ロット数",
  "通貨",
  "単価",
  "改訂前単価",
  "差額",
  "支給材建値",
  "材料建値",
  "単価改定",
  "設計変更",
  "為替変動",
  "その他",
  "適用開始日",
  "適用終了日",
  "備考（改訂理由）",
  "申請No",
  "申請者",
  "承認日時",
  "区分",
];

/** CSVの1セル（カンマ・改行・引用符を含むときだけ引用する） */
function cell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (s === "") return "";
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function line(values: (string | number | null | undefined)[]): string {
  return values.map(cell).join(",") + "\r\n";
}

/** 枝番・納入場所の「*」は未設定の意味なので空欄で出す */
function code(v: string | null): string {
  return v && v !== "*" ? v : "";
}

function rowOf(r: PriceHistoryRow): string {
  const diff =
    r.priceBefore == null ? null : Math.round((r.price - r.priceBefore) * 10000) / 10000;
  return line([
    r.itemCd,
    code(r.itemBranch),
    r.itemName ?? "",
    r.supplierCd,
    r.supplierName ?? "",
    code(r.locCd),
    r.locName ?? "",
    code(r.dlvCd),
    r.unitCd ?? "",
    r.lotQty,
    r.currency ?? "",
    r.price,
    r.priceBefore,
    diff,
    r.bdSupplyMat,
    r.bdMaterial,
    r.bdRevision,
    r.bdDesign,
    r.bdForex,
    r.bdOther,
    r.startDate,
    r.endDate ?? "",
    r.reason ?? "",
    r.reqNo,
    r.applicantName ?? "",
    r.approvedAt ? r.approvedAt.slice(0, 19).replace("T", " ") : "",
    r.source === "approval" ? "申請" : "移行",
  ]);
}

const SORT_KEYS: PriceSort[] = [
  "startDate",
  "endDate",
  "itemCd",
  "itemName",
  "supplier",
  "loc",
  "price",
  "reason",
  "source",
];

/** 1回に読む行数。大きすぎるとメモリを食い、小さすぎると往復が増える */
const CHUNK = 5000;

export async function GET(req: Request) {
  const session = await requireSession();
  const sp = new URL(req.url).searchParams;
  const str = (k: string) => sp.get(k)?.trim() || null;
  const ymd = (k: string) => {
    const v = str(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const sortParam = sp.get("sort") ?? "";
  const sort = (SORT_KEYS as string[]).includes(sortParam)
    ? (sortParam as PriceSort)
    : PRICE_SORT_DEFAULT;
  const dirParam = sp.get("dir");
  const dir: "asc" | "desc" =
    dirParam === "asc" ? "asc" : dirParam === "desc" ? "desc" : sort === "startDate" ? "desc" : "asc";
  const factorParam = sp.get("factor") ?? "";
  const factor = (PRICE_FACTORS as readonly (readonly [string, string, string])[]).some(
    ([k]) => k === factorParam
  )
    ? (factorParam as PriceFactor)
    : null;

  const scope = supplierScopeOf(session);
  const opts = {
    q: str("q"),
    itemQ: str("itemQ"),
    itemNameQ: str("itemNameQ"),
    supplierQ: str("supplierQ"),
    locQ: str("locQ"),
    reasonQ: str("reasonQ"),
    from: ymd("from"),
    to: ymd("to"),
    period: (sp.get("period") === "overlap" ? "overlap" : "start") as "start" | "overlap",
    factor,
    // 一般（バイヤー）は担当取引先の範囲だけ書き出せる
    buyerLoginId: scope.buyerLoginId,
    activeOnly: sp.get("active") === "1",
    sort,
    dir,
    maxLimit: CHUNK,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // BOM を付けて Excel が UTF-8 と判断できるようにする
        controller.enqueue(encoder.encode("﻿" + line(HEADERS)));
        for (let offset = 0; ; offset += CHUNK) {
          const { rows } = await listPrices(session.companyId, {
            ...opts,
            limit: CHUNK,
            offset,
            withCount: false,
          });
          if (rows.length === 0) break;
          controller.enqueue(encoder.encode(rows.map(rowOf).join("")));
          if (rows.length < CHUNK) break;
        }
      } catch (err) {
        console.error("[export/prices] error:", err);
        controller.enqueue(encoder.encode("\r\n# 書き出しの途中でエラーが発生しました\r\n"));
      } finally {
        controller.close();
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="price-history-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`単価履歴_${stamp}.csv`)}`,
      "Cache-Control": "no-store",
    },
  });
}
