import Link from "next/link";
import { Upload } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listEmployees } from "@/lib/db";
import { deleteEmployeeAction, upsertEmployeeAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import DeleteButton from "@/components/DeleteButton";
import SyncUsersButton from "@/components/SyncUsersButton";

export const dynamic = "force-dynamic";

const WF_LABEL: Record<string, string> = { mgr: "MGR", dept: "部門長" };

/**
 * 社員マスタ（管理者のみ）。
 * ここに登録した社員から、アプリのログインユーザーと承認W/Fの承認者をまとめて作成する。
 */
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const rows = await listEmployees(session.companyId, { q: q || null });
  const pending = rows.filter((e) => e.active && !e.userExists).length;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageHeader
        title="社員マスタ"
        description={`社員番号・氏名・承認W/F・権限を管理します（全 ${rows.length.toLocaleString()} 名）。取引先の担当窓口の名寄せにも使います。`}
        actions={
          <Link
            href="/import?tab=employees"
            className="inline-flex items-center gap-2 rounded-lg border border-[#e11d48] px-4 py-2 text-sm font-semibold text-[#e11d48] hover:bg-[#fff1f2]"
          >
            <Upload className="h-4 w-4" />
            Excel/CSVで一括取込
          </Link>
        }
      />

      <div className="mb-4 rounded-xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-[#333333]">社員マスタからユーザーを登録</h2>
        <p className="mb-3 text-sm text-[#707070]">
          社員マスタの内容でログインユーザーを作成・更新し、承認W/Fの承認者（MGR・部門長）も合わせて設定します。
          既存ユーザーは氏名と権限のみ更新され、パスワードは変わりません。
          {pending > 0 && (
            <span className="ml-1 font-medium text-[#e11d48]">未登録の社員が {pending} 名います。</span>
          )}
        </p>
        <SyncUsersButton />
      </div>

      <form
        action={upsertEmployeeAction}
        className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:grid-cols-6"
      >
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">社員番号 *</label>
          <input name="loginId" required className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 font-mono text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">氏名 *</label>
          <input name="name" required className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">承認W/F</label>
          <select name="wfRole" className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm">
            <option value="">（承認者でない）</option>
            <option value="mgr">MGR</option>
            <option value="dept">部門長</option>
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">権限</label>
          <select name="role" className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm">
            <option value="member">一般</option>
            <option value="admin">管理者</option>
          </select>
        </div>
        <div className="flex items-end">
          <button className="w-full rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]">
            登録 / 更新
          </button>
        </div>
      </form>

      <form action="/employees" method="GET" className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="社員番号・氏名で検索"
          className="w-72 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none"
        />
      </form>

      <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
              <th className="px-4 py-2.5 font-medium">社員番号</th>
              <th className="px-2 py-2.5 font-medium">氏名</th>
              <th className="px-2 py-2.5 font-medium">承認W/F</th>
              <th className="px-2 py-2.5 font-medium">権限</th>
              <th className="px-2 py-2.5 font-medium">ユーザー</th>
              <th className="px-2 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b border-[#f5f5f5] hover:bg-[#f7f7f5]">
                <td className="px-4 py-2 font-mono">{e.loginId}</td>
                <td className="px-2 py-2">{e.name || <span className="text-[#a0a0a0]">—</span>}</td>
                <td className="px-2 py-2">
                  {e.wfRole ? (
                    <span className="rounded-full bg-[#fff1f2] px-2 py-0.5 text-xs font-medium text-[#e11d48]">
                      {WF_LABEL[e.wfRole]}
                    </span>
                  ) : (
                    <span className="text-[#a0a0a0]">—</span>
                  )}
                </td>
                <td className="px-2 py-2">{e.role === "admin" ? "管理者" : "一般"}</td>
                <td className="px-2 py-2 text-xs">
                  {e.userExists ? (
                    <span className="text-emerald-700">登録済</span>
                  ) : (
                    <span className="text-[#a0a0a0]">未登録</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <DeleteButton
                    action={deleteEmployeeAction.bind(null, e.id)}
                    confirmText={`社員 ${e.loginId} ${e.name} を社員マスタから削除しますか？（ログインユーザーは削除されません）`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-[#707070]">
            社員が登録されていません。社員一覧のExcel/CSVを一括取込するか、上のフォームから登録してください。
          </p>
        )}
      </div>
    </div>
  );
}
