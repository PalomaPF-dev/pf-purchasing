import { formatDiff } from "@/lib/format";
import type { PriceHistoryRow } from "@/lib/types";

/**
 * 単価差の要因（内訳）。単価履歴の一覧・詳細で、差額の右にこの順で並べる。
 * mcframe の単価改訂履歴から取り込んだ内訳がそのまま入る（値のない要因は「—」）。
 */
export const PRICE_BREAKDOWN: { key: keyof PriceHistoryRow; label: string }[] = [
  { key: "bdSupplyMat", label: "支給材建値" },
  { key: "bdMaterial", label: "材料建値" },
  { key: "bdRevision", label: "単価改定" },
  { key: "bdDesign", label: "設計変更" },
  { key: "bdForex", label: "為替変動" },
  { key: "bdOther", label: "その他" },
];

/** 内訳の列グループを囲む罫線（先頭列の左・末尾列の右） */
export function bdEdge(i: number): string {
  const l = i === 0 ? "border-l border-[#eeeeee]" : "";
  const r = i === PRICE_BREAKDOWN.length - 1 ? "border-r border-[#eeeeee]" : "";
  return `${l} ${r}`;
}

/** 内訳の見出し（要因ごとに1列） */
export function BreakdownHeadCells({ className = "px-2 py-2" }: { className?: string }) {
  return (
    <>
      {PRICE_BREAKDOWN.map((b, i) => (
        <th
          key={b.key}
          className={`${className} whitespace-nowrap bg-[#fafafa] text-right text-[11px] font-medium ${bdEdge(i)}`}
        >
          {b.label}
        </th>
      ))}
    </>
  );
}

/** 内訳の値（要因ごとに1列）。プラスは赤・マイナスは緑、金額なしは「—」 */
export function BreakdownCells({ row }: { row: PriceHistoryRow }) {
  return (
    <>
      {PRICE_BREAKDOWN.map((b, i) => {
        const v = row[b.key] as number | null;
        const tone =
          v == null || v === 0
            ? "text-[#d5d5d5]"
            : v > 0
              ? "font-medium text-red-600"
              : "font-medium text-emerald-600";
        return (
          <td
            key={b.key}
            className={`px-2 py-2 text-right font-mono text-xs ${tone} ${bdEdge(i)}`}
          >
            {v == null || v === 0 ? "—" : formatDiff(v)}
          </td>
        );
      })}
    </>
  );
}
