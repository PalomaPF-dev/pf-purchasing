import Link from "next/link";
import { requireSession, supplierScopeOf } from "@/lib/session";
import { listPrices, PRICE_SORT_DEFAULT, type PriceSort } from "@/lib/db";
import { formatDate, formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import SearchBox from "@/components/SearchBox";
import PriceFilters from "@/components/PriceFilters";
import SortHeader from "@/components/SortHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 単価履歴の検索一覧 */
const SORT_KEYS: PriceSort[] = [
  "startDate",
  "endDate",
  "itemCd",
  "itemName",
  "supplier",
  "loc",
  "price",
  "source",
];

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    itemQ?: string;
    itemNameQ?: string;
    supplierQ?: string;
    locQ?: string;
    page?: string;
    active?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const filters = {
    itemQ: sp.itemQ ?? "",
    itemNameQ: sp.itemNameQ ?? "",
    supplierQ: sp.supplierQ ?? "",
    locQ: sp.locQ ?? "",
  };
  const activeOnly = sp.active === "1";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  // 並び替え（不正な値は既定に落とす）
  const sort = (SORT_KEYS as string[]).includes(sp.sort ?? "")
    ? (sp.sort as PriceSort)
    : PRICE_SORT_DEFAULT;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : sort === "startDate" ? "desc" : "asc";

  const scope = supplierScopeOf(session);
  const { rows, total } = await listPrices(session.companyId, {
    q: q || null,
    ...filters,
    buyerLoginId: scope.buyerLoginId,
    activeOnly,
    sort,
    dir,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string> = {
      q,
      ...filters,
      active: activeOnly ? "1" : "",
      sort: sort === PRICE_SORT_DEFAULT && dir === "desc" ? "" : sort,
      dir: sort === PRICE_SORT_DEFAULT && dir === "desc" ? "" : dir,
      page: "",
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  /** 並び替え見出しのリンク先（検索条件は保つ・ページは先頭に戻す） */
  const sortHref = (key: string, d: "asc" | "desc") => `/prices${qs({ sort: key, dir: d })}`;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="単価履歴"
        description={`購買単価の適用履歴（${scope.restricted ? "担当取引先のみ・" : ""}全 ${total.toLocaleString()} 件）。品目CDをクリックすると改訂履歴と理由を表示します。`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox
          action="/prices"
          q={q}
          total={total}
          placeholder="品目CD・品名・取引先・納入場所で検索"
          hidden={{
            active: activeOnly ? "1" : undefined,
            // 項目別の絞り込みと並び替えは、まとめ検索をしても保つ
            itemQ: filters.itemQ || undefined,
            itemNameQ: filters.itemNameQ || undefined,
            supplierQ: filters.supplierQ || undefined,
            locQ: filters.locQ || undefined,
            sort: sort === PRICE_SORT_DEFAULT && dir === "desc" ? undefined : sort,
            dir: sort === PRICE_SORT_DEFAULT && dir === "desc" ? undefined : dir,
          }}
          scope="prices"
          className=""
        />
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

      <PriceFilters
        values={filters}
        q={q}
        activeOnly={activeOnly}
        sort={sort === PRICE_SORT_DEFAULT && dir === "desc" ? "" : sort}
        dir={sort === PRICE_SORT_DEFAULT && dir === "desc" ? "" : dir}
      />

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
              {/* 見出しをクリックすると、その項目で並び替える */}
              <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
                <th className="px-4 py-2.5 font-medium">
                  <SortHeader label="品目CD" sortKey="itemCd" current={sort} dir={dir} href={sortHref} />
                </th>
                <th className="px-2 py-2.5 font-medium">
                  <SortHeader label="品名" sortKey="itemName" current={sort} dir={dir} href={sortHref} />
                </th>
                <th className="px-2 py-2.5 font-medium">
                  <SortHeader label="取引先" sortKey="supplier" current={sort} dir={dir} href={sortHref} />
                </th>
                <th className="px-2 py-2.5 font-medium">
                  <SortHeader label="納入場所" sortKey="loc" current={sort} dir={dir} href={sortHref} />
                </th>
                <th className="px-2 py-2.5 text-right font-medium">
                  <SortHeader
                    label="単価"
                    sortKey="price"
                    current={sort}
                    dir={dir}
                    href={sortHref}
                    align="right"
                    defaultDir="desc"
                  />
                </th>
                <th className="px-2 py-2.5 font-medium">
                  <SortHeader
                    label="適用開始"
                    sortKey="startDate"
                    current={sort}
                    dir={dir}
                    href={sortHref}
                    defaultDir="desc"
                  />
                </th>
                <th className="px-2 py-2.5 font-medium">
                  <SortHeader
                    label="適用終了"
                    sortKey="endDate"
                    current={sort}
                    dir={dir}
                    href={sortHref}
                    defaultDir="desc"
                  />
                </th>
                <th className="px-2 py-2.5 font-medium">
                  <SortHeader label="区分" sortKey="source" current={sort} dir={dir} href={sortHref} />
                </th>
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
                  <td className="px-2 py-2 text-xs">
                    {p.locCd && p.locCd !== "*" ? (
                      <>
                        <span className="font-mono">{p.locCd}</span>
                        {p.locName && <span className="ml-1 text-[#707070]">{p.locName}</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
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
