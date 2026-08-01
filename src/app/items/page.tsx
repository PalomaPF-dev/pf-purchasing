import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { listItems } from "@/lib/db";
import { upsertItemAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import ImportPanel from "@/components/ImportPanel";
import ItemRow from "@/components/ItemRow";
import SearchBox from "@/components/SearchBox";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 品番マスタ（一覧・追加・編集・削除）。同じ品目CD＋枝番で登録すると上書き更新。 */
export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const { rows, total } = await listItems(session.companyId, {
    q: q || null,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inputCls = "w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm";

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="品番マスタ"
        description={`品目（品番）の追加・編集・削除（全 ${total.toLocaleString()} 件）。「取引先CD・取引先名・適用日」は単価履歴の最新の適用単価から表示しています。`}
      />

      <ImportPanel kinds={["items"]} title="Excel/CSVで品番マスタを一括登録" />

      {/* 追加・更新フォーム */}
      <form
        action={upsertItemAction}
        className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:grid-cols-6"
      >
        <div className="col-span-2 sm:col-span-6">
          <h2 className="text-sm font-bold text-[#333333]">品番を追加</h2>
          <p className="text-xs text-[#a0a0a0]">
            既に登録済みの品目CD＋枝番を入力すると、その品番の内容を上書きします。登録後の修正は一覧の鉛筆アイコンから行えます。
          </p>
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">品目CD *</label>
          <input name="code" required className={`${inputCls} font-mono`} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">品名 *</label>
          <input name="name" required className={inputCls} />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">科目</label>
          <input name="acctCd" placeholder="0010" className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">科目名</label>
          <input name="acctName" placeholder="素材費" className={inputCls} />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">科目内訳</label>
          <input name="acctDetail" placeholder="ステンレス" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">借方ICS科目名（製造）</label>
          <input name="icsName" placeholder="素材費Ⅰ" className={inputCls} />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">品目区分</label>
          <input name="itemClass" placeholder="3" className={inputCls} />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">材料区分</label>
          <input name="materialClass" className={inputCls} />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">枝番</label>
          <input name="branch" className={`${inputCls} font-mono`} />
        </div>
        <div className="flex items-end">
          <button className="w-full rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]">
            登録 / 更新
          </button>
        </div>
      </form>

      {/* 検索 */}
      <SearchBox action="/items" q={q} placeholder="品目CD・品名で検索" total={total} />

      <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
              <th className="px-4 py-2.5 font-medium">品目CD</th>
              <th className="px-2 py-2.5 font-medium">枝番</th>
              <th className="px-2 py-2.5 font-medium">品名</th>
              <th className="px-2 py-2.5 font-medium">取引先CD</th>
              <th className="px-2 py-2.5 font-medium">取引先名</th>
              <th className="px-2 py-2.5 font-medium">科目</th>
              <th className="px-2 py-2.5 font-medium">科目名</th>
              <th className="px-2 py-2.5 font-medium">科目内訳</th>
              <th className="px-2 py-2.5 font-medium">借方ICS科目名（製造）</th>
              <th className="px-2 py-2.5 font-medium">品目区分</th>
              <th className="px-2 py-2.5 font-medium">材料区分</th>
              <th className="px-2 py-2.5 font-medium">適用日</th>
              <th className="px-2 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <ItemRow key={it.id} item={it} />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-[#707070]">
            品目がありません。上の「品番を追加」または一括登録から登録してください。
          </p>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={`/items?q=${encodeURIComponent(q)}&page=${page - 1}`} className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]">
              ← 前へ
            </Link>
          )}
          <span className="text-[#707070]">{page} / {pages} ページ</span>
          {page < pages && (
            <Link href={`/items?q=${encodeURIComponent(q)}&page=${page + 1}`} className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]">
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
