import Link from "next/link";
import { ArrowLeft, Paperclip } from "lucide-react";
import { requireSession, supplierScopeOf } from "@/lib/session";
import { filesForHistoryRows, priceHistoryFor, requestLineDetail } from "@/lib/db";
import { formatDate, formatDiff, formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import {
  BreakdownCells,
  BreakdownHeadCells,
  PRICE_BREAKDOWN,
} from "@/components/PriceBreakdown";

export const dynamic = "force-dynamic";

/**
 * 品目の単価改訂履歴（取引先・納入場所別の時系列と改訂理由）。
 * 申請由来の行は申請詳細・承認用紙へのリンク付き。
 */
export default async function PriceHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemCd: string }>;
  searchParams: Promise<{ supplier?: string }>;
}) {
  const session = await requireSession();
  const { itemCd: rawItemCd } = await params;
  const itemCd = decodeURIComponent(rawItemCd);
  const sp = await searchParams;
  const supplier = sp.supplier || null;

  const scope = supplierScopeOf(session);
  const rows = await priceHistoryFor(session.companyId, itemCd, supplier, scope.buyerLoginId);
  const itemName = rows.find((r) => r.itemName)?.itemName ?? "";

  // 申請由来の行の申請ID（リンク用）を取得
  const requestLinks = new Map<string, string>();
  await Promise.all(
    rows
      .filter((r) => r.requestLineId)
      .map(async (r) => {
        const d = await requestLineDetail(session.companyId, r.requestLineId as string);
        if (d) requestLinks.set(r.id, d.request.id);
      })
  );

  // 申請時に添付された見積書・資料（履歴からそのまま開ける）
  const filesByLine = await filesForHistoryRows(
    session.companyId,
    rows.map((r) => r.requestLineId).filter((v): v is string => !!v)
  );

  // 取引先×納入場所×納品先×ロットごとにグループ化して時系列表示。
  // 同じ品目でもロット数が違えば別の単価として登録されるため、ロットも区切りに含める
  // （混ぜると「改訂前単価」が別ロットの単価になってしまう）。
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.supplierCd}｜${r.supplierName ?? ""}｜${r.locCd ?? "*"}｜${r.dlvCd ?? "*"}｜${r.lotQty ?? ""}｜${r.locName ?? ""}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  // 各グループ内は新しい順。グループ自体も最新の適用日が新しい順に並べる
  for (const list of groups.values()) list.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const sortedGroups = [...groups.entries()].sort((a, b) =>
    (a[1][0]?.startDate ?? "") < (b[1][0]?.startDate ?? "") ? 1 : -1
  );

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <Link
        href="/prices"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#e11d48] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        単価履歴に戻る
      </Link>
      <PageHeader
        title={`単価改訂履歴: ${itemCd}`}
        description={itemName || undefined}
      />

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#707070]">
          この品目の履歴がありません。
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGroups.map(([key, list]) => {
            const [supplierCd, supplierName, locCd, dlvCd, lot, locName] = key.split("｜");
            return (
              <section key={key} className="rounded-xl border border-[#e5e5e5] bg-white">
                <div className="border-b border-[#eeeeee] px-4 py-3 text-sm font-bold text-[#333333]">
                  取引先 <span className="font-mono">{supplierCd}</span> {supplierName}
                  {locCd !== "*" && (
                    <span className="ml-3 text-xs font-normal text-[#707070]">
                      納入場所: {locCd}
                      {locName ? ` ${locName}` : ""}
                    </span>
                  )}
                  {dlvCd !== "*" && (
                    <span className="ml-3 text-xs font-normal text-[#707070]">納品先: {dlvCd}</span>
                  )}
                  {/* ロット違いは別単価。どのロットの履歴かを明示する */}
                  {lot && (
                    <span className="ml-3 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                      ロット {Number(lot).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      {/* 差額の右に、単価差の要因（内訳）を要因ごとの列で並べる */}
                      <tr className="text-left text-xs text-[#707070]">
                        <th className="px-4 py-2 font-medium" rowSpan={2}>適用開始</th>
                        <th className="px-2 py-2 font-medium" rowSpan={2}>適用終了</th>
                        <th className="px-2 py-2 text-right font-medium" rowSpan={2}>単価</th>
                        <th className="px-2 py-2 text-right font-medium" rowSpan={2}>改訂前</th>
                        <th className="px-2 py-2 text-right font-medium" rowSpan={2}>差額</th>
                        <th
                          className="border-x border-[#eeeeee] bg-[#fafafa] px-2 pt-2 text-center font-medium"
                          colSpan={PRICE_BREAKDOWN.length}
                        >
                          単価差の要因（内訳）
                        </th>
                        <th className="px-2 py-2 font-medium" rowSpan={2}>備考（改訂理由）</th>
                        <th className="px-2 py-2 font-medium" rowSpan={2}>添付資料</th>
                        <th className="px-2 py-2 font-medium" rowSpan={2}>出所</th>
                      </tr>
                      <tr className="border-b border-[#eeeeee] text-xs text-[#707070]">
                        <BreakdownHeadCells className="px-2 pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r, i) => {
                        // 改訂前単価: 明示値がなければ次に古い行の単価
                        const prevPrice = r.priceBefore ?? list[i + 1]?.price ?? null;
                        const diff = prevPrice != null ? Math.round((r.price - prevPrice) * 10000) / 10000 : null;
                        const reqId = requestLinks.get(r.id);
                        return (
                          <tr key={r.id} className={`border-b border-[#f5f5f5] ${i === 0 ? "bg-[#f0f7ff]" : ""}`}>
                            <td className="px-4 py-2">
                              {formatDate(r.startDate)}
                              {i === 0 && (
                                <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                                  最新
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-xs">{formatDate(r.endDate)}</td>
                            <td className="px-2 py-2 text-right font-mono font-semibold">{formatPrice(r.price)}</td>
                            <td className="px-2 py-2 text-right font-mono text-[#707070]">{formatPrice(prevPrice)}</td>
                            <td
                              className={`px-2 py-2 text-right font-mono ${
                                diff != null && diff > 0
                                  ? "text-red-600"
                                  : diff != null && diff < 0
                                    ? "text-emerald-600"
                                    : "text-[#707070]"
                              }`}
                            >
                              {formatDiff(diff)}
                            </td>
                            <BreakdownCells row={r} />
                            <td className="px-2 py-2 text-xs">{r.reason ?? "—"}</td>
                            <td className="px-2 py-2 text-xs">
                              {(() => {
                                const fs = r.requestLineId ? filesByLine.get(r.requestLineId) : undefined;
                                if (!fs || fs.length === 0) return <span className="text-[#c0c0c0]">—</span>;
                                return (
                                  <ul className="space-y-0.5">
                                    {fs.map((f) => (
                                      <li key={f.id}>
                                        <a
                                          href={`/api/request-files/${f.id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex max-w-[14rem] items-center gap-1 text-[#e11d48] hover:underline"
                                          title={f.fileName}
                                        >
                                          <Paperclip className="h-3 w-3 shrink-0" />
                                          <span className="truncate">{f.fileName}</span>
                                        </a>
                                      </li>
                                    ))}
                                  </ul>
                                );
                              })()}
                            </td>
                            <td className="px-2 py-2 text-xs">
                              {reqId ? (
                                <Link href={`/requests/${reqId}`} className="text-[#e11d48] hover:underline">
                                  {r.reqNo != null ? `申請 #${r.reqNo}` : "申請を見る"}
                                  {r.applicantName ? (
                                    <span className="block text-[10px] text-[#a0a0a0]">{r.applicantName}</span>
                                  ) : null}
                                </Link>
                              ) : r.source === "migration" ? (
                                <span className="text-[#a0a0a0]">移行データ</span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
