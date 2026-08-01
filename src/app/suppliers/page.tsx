import Link from "next/link";
import { requireSession, supplierScopeOf } from "@/lib/session";
import { listSuppliers } from "@/lib/db";
import { deleteSupplierAction, upsertSupplierAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/DeleteButton";
import ContactsAssign, { ContactLabel } from "@/components/ContactsAssign";
import ImportPanel from "@/components/ImportPanel";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** 取引先マスタ。同じ取引先CDで登録すると上書き更新。 */
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  // 管理者は全件＋担当割当、一般（バイヤー）は自分の担当取引先のみ閲覧
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
            ? `取引先の登録・編集と担当窓口（企画G＝バイヤー／管理G＝チェイサー）の割当（全 ${total.toLocaleString()} 件）。`
            : `あなたが担当する取引先（${total.toLocaleString()} 件）。単価申請・単価履歴もこの取引先のみが対象です。`
        }
      />

      {isAdmin && (
        <ImportPanel
          kinds={["suppliers", "supplier-contacts"]}
          title="Excel/CSVで取引先・担当窓口を一括登録"
        />
      )}

      {isAdmin && (
        <form
          action={upsertSupplierAction}
          className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:grid-cols-5"
        >
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">取引先CD *</label>
            <input name="code" required className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 font-mono text-sm" />
          </div>
          <div className="col-span-2">
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">取引先名 *</label>
            <input name="name" required className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">
              企画G バイヤー（社員番号）
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
          placeholder="取引先CD・取引先名で検索"
          className="w-72 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none"
        />
      </form>

      <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
              <th className="px-4 py-2.5 font-medium">取引先CD</th>
              <th className="px-2 py-2.5 font-medium">取引先名</th>
              <th className="px-2 py-2.5 font-medium">企画G（バイヤー）</th>
              <th className="px-2 py-2.5 font-medium">管理G（チェイサー）</th>
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
                    <ContactsAssign
                      supplierId={s.id}
                      supplierLabel={`${s.code} ${s.name}`}
                      group="planning"
                      buyer={{ loginId: s.buyerLoginId, name: s.buyerName ?? null }}
                      buyerSub={{ loginId: s.buyerSubLoginId ?? null, name: s.buyerSubName ?? null }}
                      chaser={{ loginId: s.chaserLoginId ?? null, name: s.chaserName ?? null }}
                    />
                  ) : (
                    <>
                      <ContactLabel loginId={s.buyerLoginId} name={s.buyerName ?? null} />
                      {s.buyerSubLoginId && (
                        <span className="block text-xs text-[#707070]">
                          副: <ContactLabel loginId={s.buyerSubLoginId} name={s.buyerSubName ?? null} />
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-2 py-2">
                  {isAdmin ? (
                    <ContactsAssign
                      supplierId={s.id}
                      supplierLabel={`${s.code} ${s.name}`}
                      group="management"
                      buyer={{ loginId: s.buyerLoginId, name: s.buyerName ?? null }}
                      buyerSub={{ loginId: s.buyerSubLoginId ?? null, name: s.buyerSubName ?? null }}
                      chaser={{ loginId: s.chaserLoginId ?? null, name: s.chaserName ?? null }}
                    />
                  ) : (
                    <ContactLabel loginId={s.chaserLoginId ?? null} name={s.chaserName ?? null} />
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
              : "担当の取引先が登録されていません。管理者に担当の割当を依頼してください。"}
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
