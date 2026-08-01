import Link from "next/link";
import { Upload } from "lucide-react";
import { requireSession, supplierScopeOf } from "@/lib/session";
import { listSuppliers } from "@/lib/db";
import { deleteSupplierAction, upsertSupplierAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/DeleteButton";
import BuyerAssign from "@/components/BuyerAssign";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 取引先（発注先）マスタ。同じ発注先CDで登録すると上書き更新。 */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  // 管理者は全件＋担当割当、一般（バイヤー）は自分の担当発注先のみ閲覧
  const session = await requireSession();
  const scope = supplierScopeOf(session);
  const isAdmin = !scope.restricted;
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const { rows, total } = await listSuppliers(session.companyId, {
    q: q || null,
    buyerLoginId: scope.buyerLoginId,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageHeader
        title="取引先マスタ"
        description={
          isAdmin
            ? `発注先の登録・編集と担当バイヤーの割当（全 ${total.toLocaleString()} 件）。`
            : `あなたが担当する発注先（${total.toLocaleString()} 件）。単価申請・単価履歴もこの発注先のみが対象です。`
        }
        actions={
          isAdmin && (
            <Link
              href="/import?tab=suppliers"
              className="inline-flex items-center gap-2 rounded-lg border border-[#e11d48] px-4 py-2 text-sm font-semibold text-[#e11d48] hover:bg-[#fff1f2]"
            >
              <Upload className="h-4 w-4" />
              Excel/CSVで一括取込
            </Link>
          )
        }
      />

      {isAdmin && (
        <form
          action={upsertSupplierAction}
          className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:grid-cols-5"
        >
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">発注先CD *</label>
            <input name="code" required className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 font-mono text-sm" />
          </div>
          <div className="col-span-2">
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">発注先名 *</label>
            <input name="name" required className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">
              担当バイヤー（社員番号）
            </label>
            <input
              name="buyerLoginId"
              placeholder="例: 12345"
              className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 font-mono text-sm"
            />
          </div>
          <div className="flex items-end">
            <button className="w-full rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]">
              登録 / 更新
            </button>
          </div>
        </form>
      )}

      <form action="/suppliers" method="GET" className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="発注先CD・発注先名で検索"
          className="w-72 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none"
        />
      </form>

      <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
              <th className="px-4 py-2.5 font-medium">発注先CD</th>
              <th className="px-2 py-2.5 font-medium">発注先名</th>
              <th className="px-2 py-2.5 font-medium">担当バイヤー</th>
              <th className="px-2 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-[#f5f5f5] hover:bg-[#f7f7f5]">
                <td className="px-4 py-2 font-mono">{s.code}</td>
                <td className="px-2 py-2">{s.name || <span className="text-[#a0a0a0]">（名称未設定）</span>}</td>
                <td className="px-2 py-2">
                  {isAdmin ? (
                    <BuyerAssign
                      supplierId={s.id}
                      buyerLoginId={s.buyerLoginId}
                      supplierLabel={`${s.code} ${s.name}`}
                    />
                  ) : (
                    <span className="font-mono text-xs">{s.buyerLoginId ?? "—"}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {isAdmin && (
                    <DeleteButton
                      action={deleteSupplierAction.bind(null, s.id)}
                      confirmText={`取引先 ${s.code} ${s.name} を削除しますか？`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-[#707070]">
            {isAdmin
              ? "取引先がありません。"
              : "担当の発注先が登録されていません。管理者に担当の割当を依頼してください。"}
          </p>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={`/suppliers?q=${encodeURIComponent(q)}&page=${page - 1}`} className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]">
              ← 前へ
            </Link>
          )}
          <span className="text-[#707070]">{page} / {pages} ページ</span>
          {page < pages && (
            <Link href={`/suppliers?q=${encodeURIComponent(q)}&page=${page + 1}`} className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]">
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
