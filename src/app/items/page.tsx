import Link from "next/link";
import { Upload } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listItems } from "@/lib/db";
import { deleteItemAction, upsertItemAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/DeleteButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 品番マスタ（一覧・登録/更新・削除）。同じ品目CD＋枝番で登録すると上書き更新。 */
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

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader
        title="品番マスタ"
        description={`品目（品番）の登録・編集（全 ${total.toLocaleString()} 件）。一括登録は一括取込から行えます。`}
        actions={
          <Link
            href="/import?tab=items"
            className="inline-flex items-center gap-2 rounded-lg border border-[#e11d48] px-4 py-2 text-sm font-semibold text-[#e11d48] hover:bg-[#fff1f2]"
          >
            <Upload className="h-4 w-4" />
            Excel/CSVで一括取込
          </Link>
        }
      />

      {/* 追加・更新フォーム */}
      <form
        action={upsertItemAction}
        className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:grid-cols-7"
      >
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">品目CD *</label>
          <input name="code" required className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 font-mono text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">枝番</label>
          <input name="branch" className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 font-mono text-sm" />
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">品名 *</label>
          <input name="name" required className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">単位CD</label>
          <input name="unitCd" className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">仕入税CD</label>
          <input name="taxCd" placeholder="P0010" className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm" />
        </div>
        <div className="flex items-end">
          <button className="w-full rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]">
            登録 / 更新
          </button>
        </div>
      </form>

      {/* 検索 */}
      <form action="/items" method="GET" className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="品目CD・品名で検索"
          className="w-72 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none"
        />
      </form>

      <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
              <th className="px-4 py-2.5 font-medium">品目CD</th>
              <th className="px-2 py-2.5 font-medium">枝番</th>
              <th className="px-2 py-2.5 font-medium">品名</th>
              <th className="px-2 py-2.5 font-medium">単位CD</th>
              <th className="px-2 py-2.5 font-medium">仕入税CD</th>
              <th className="px-2 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.id} className="border-b border-[#f5f5f5] hover:bg-[#f7f7f5]">
                <td className="px-4 py-2 font-mono">
                  <Link href={`/prices/${encodeURIComponent(it.code)}`} className="text-[#e11d48] hover:underline">
                    {it.code}
                  </Link>
                </td>
                <td className="px-2 py-2 font-mono">{it.branch ?? "—"}</td>
                <td className="px-2 py-2">{it.name || <span className="text-[#a0a0a0]">（名称未設定）</span>}</td>
                <td className="px-2 py-2">{it.unitCd ?? "—"}</td>
                <td className="px-2 py-2">{it.taxCd ?? "—"}</td>
                <td className="px-2 py-2 text-right">
                  <DeleteButton
                    action={deleteItemAction.bind(null, it.id)}
                    confirmText={`品目 ${it.code} を削除しますか？`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-[#707070]">品目がありません。</p>
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
