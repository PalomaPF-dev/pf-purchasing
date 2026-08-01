import Link from "next/link";
import { requireSession, supplierScopeOf } from "@/lib/session";
import { listPrices } from "@/lib/db";
import { formatDate, formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 単価履歴の検索一覧 */
export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; active?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const activeOnly = sp.active === "1";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const scope = supplierScopeOf(session);
  const { rows, total } = await listPrices(session.companyId, {
    q: q || null,
    buyerLoginId: scope.buyerLoginId,
    activeOnly,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string> = { q, active: activeOnly ? "1" : "", page: "", ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="単価履歴"
        description={`購買単価の適用履歴（${scope.restricted ? "担当発注先のみ・" : ""}全 ${total.toLocaleString()} 件）。品目CDをクリックすると改訂履歴と理由を表示します。`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action="/prices" method="GET" className="flex items-center gap-2">
          {activeOnly && <input type="hidden" name="active" value="1" />}
          <input
            name="q"
            defaultValue={q}
            placeholder="品目CD・品名・発注先CD・発注先名で検索"
            className="w-80 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none"
          />
          <button className="rounded-lg bg-[#e11d48] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#be123c]">
            検索
          </button>
        </form>
        <Link
          href={`/prices${qs({ active: activeOnly ? "" : "1" })}`}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            activeOnly
              ? "bg-[#e11d48] text-white"
              : "border border-[#e5e5e5] bg-white text-[#555555] hover:bg-[#f7f7f5]"
          }`}
        >
          現在適用中のみ
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#707070]">
          該当する単価データがありません。
          <div className="mt-2">
            現行データの取り込みは <Link href="/migrate" className="text-[#e11d48] hover:underline">データ移行</Link> から行えます。
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
                <th className="px-4 py-2.5 font-medium">品目CD</th>
                <th className="px-2 py-2.5 font-medium">品名</th>
                <th className="px-2 py-2.5 font-medium">発注先</th>
                <th className="px-2 py-2.5 font-medium">納入場所</th>
                <th className="px-2 py-2.5 text-right font-medium">単価</th>
                <th className="px-2 py-2.5 font-medium">適用開始</th>
                <th className="px-2 py-2.5 font-medium">適用終了</th>
                <th className="px-2 py-2.5 font-medium">区分</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-[#f5f5f5] hover:bg-[#f7f7f5]">
                  <td className="px-4 py-2 font-mono">
                    <Link
                      href={`/prices/${encodeURIComponent(p.itemCd)}?supplier=${encodeURIComponent(p.supplierCd)}`}
                      className="text-[#e11d48] hover:underline"
                    >
                      {p.itemCd}
                      {p.itemBranch && p.itemBranch !== "*" ? `-${p.itemBranch}` : ""}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{p.itemName || "—"}</td>
                  <td className="px-2 py-2">
                    <span className="font-mono">{p.supplierCd}</span> {p.supplierName ?? ""}
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{p.locCd && p.locCd !== "*" ? p.locCd : "—"}</td>
                  <td className="px-2 py-2 text-right font-mono font-semibold">{formatPrice(p.price)}</td>
                  <td className="px-2 py-2 text-xs">{formatDate(p.startDate)}</td>
                  <td className="px-2 py-2 text-xs">{formatDate(p.endDate)}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        p.source === "approval"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p.source === "approval" ? "申請" : "移行"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ページャ */}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={`/prices${qs({ page: String(page - 1) })}`} className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]">
              ← 前へ
            </Link>
          )}
          <span className="text-[#707070]">
            {page} / {pages} ページ
          </span>
          {page < pages && (
            <Link href={`/prices${qs({ page: String(page + 1) })}`} className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]">
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
