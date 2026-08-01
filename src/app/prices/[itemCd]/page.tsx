import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { priceHistoryFor, requestLineDetail } from "@/lib/db";
import { formatDate, formatDiff, formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

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

  const rows = await priceHistoryFor(session.companyId, itemCd, supplier);
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

  // 取引先×納入場所×納品先ごとにグループ化して時系列表示
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.supplierCd}｜${r.supplierName ?? ""}｜${r.locCd ?? "*"}｜${r.dlvCd ?? "*"}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link
        href="/prices"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#2563eb] hover:underline"
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
          {[...groups.entries()].map(([key, list]) => {
            const [supplierCd, supplierName, locCd, dlvCd] = key.split("｜");
            return (
              <section key={key} className="rounded-xl border border-[#e5e5e5] bg-white">
                <div className="border-b border-[#eeeeee] px-4 py-3 text-sm font-bold text-[#333333]">
                  発注先 <span className="font-mono">{supplierCd}</span> {supplierName}
                  {locCd !== "*" && (
                    <span className="ml-3 text-xs font-normal text-[#707070]">納入場所: {locCd}</span>
                  )}
                  {dlvCd !== "*" && (
                    <span className="ml-3 text-xs font-normal text-[#707070]">納品先: {dlvCd}</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
                        <th className="px-4 py-2 font-medium">適用開始</th>
                        <th className="px-2 py-2 font-medium">適用終了</th>
                        <th className="px-2 py-2 text-right font-medium">単価</th>
                        <th className="px-2 py-2 text-right font-medium">改訂前</th>
                        <th className="px-2 py-2 text-right font-medium">差額</th>
                        <th className="px-2 py-2 font-medium">改訂理由</th>
                        <th className="px-2 py-2 font-medium">出所</th>
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
                                <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
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
                            <td className="px-2 py-2 text-xs">{r.reason ?? "—"}</td>
                            <td className="px-2 py-2 text-xs">
                              {reqId ? (
                                <Link href={`/requests/${reqId}`} className="text-[#2563eb] hover:underline">
                                  申請を見る
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
