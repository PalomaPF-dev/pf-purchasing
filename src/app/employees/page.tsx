import { requireAdminPage } from "@/lib/session";
import { getWfSettings, listEmployees } from "@/lib/db";
import { upsertEmployeeAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import EmployeeRow from "@/components/EmployeeRow";
import WfLabelsForm from "@/components/WfLabelsForm";
import SearchBox from "@/components/SearchBox";

export const dynamic = "force-dynamic";

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
  const [rows, wf] = await Promise.all([
    listEmployees(session.companyId, { q: q || null }),
    getWfSettings(session.companyId),
  ]);
  // 承認W/Fの現在の指定（この画面での設定がそのまま承認者になる）
  const mgrs = rows.filter((e) => e.active && e.wfRole === "mgr");
  const depts = rows.filter((e) => e.active && e.wfRole === "dept");
  // 承認担当者の候補（検索中でも全員から選べるように別途取得）
  const all = q ? await listEmployees(session.companyId) : rows;
  const toC = (list: typeof rows) => list.map((e) => ({ loginId: e.loginId, name: e.name }));
  const mgrCandidates = toC(all.filter((e) => e.active && e.wfRole === "mgr"));
  const deptCandidates = toC(all.filter((e) => e.active && e.wfRole === "dept"));
  // 承認バイヤーは同じグループの誰でも選べる（自分自身は除く）
  const buyerCandidatesAll = toC(all.filter((e) => e.active));

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="ユーザー登録（社員マスタ）"
        description={`社員番号・氏名・承認W/F・権限を管理し、ログインユーザーをまとめて登録します（全 ${rows.length.toLocaleString()} 名）。取引先の担当窓口の名寄せにも使います。`}
      />

      {/* 承認W/F（この画面の「承認W/F」欄がそのまま承認者になる） */}
      <div className="mb-4 rounded-xl border border-[#e5e5e5] bg-white p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[#333333]">承認ワークフロー（ユーザーごとに指定）</h2>
          <WfLabelsForm mgrLabel={wf.mgrLabel} deptLabel={wf.deptLabel} />
        </div>
        <p className="mb-3 text-sm text-[#707070]">
          一覧の「承認W/F」欄で {wf.mgrLabel} / {wf.deptLabel} を選ぶと、その社員が単価申請の承認者になります（保存した時点で反映されます）。
          単価申請は <span className="font-medium">{wf.mgrLabel}承認 → {wf.deptLabel}承認</span> の2段階です。
          どちらも未指定の場合は、すべての管理者が承認できます。
        </p>
        <p className="mb-3 text-sm text-[#707070]">
          {wf.mgrLabel}が複数いる場合は、一覧の「承認{wf.mgrLabel}」「承認{wf.deptLabel}」欄で
          <span className="font-medium">ユーザーごとに承認担当者を割り当て</span>できます。
          割り当てると、その人の申請はその担当者だけが承認・差し戻しできます（未割当なら該当段階の承認者全員）。
          「承認{wf.buyerLabel}」を設定すると、{wf.mgrLabel}承認の<span className="font-medium">前に</span>
          そのバイヤーの確認が入ります（双方でチェックする運用向け。設定しなければこの段階はありません）。
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [`${wf.mgrLabel}承認`, mgrs],
              [`${wf.deptLabel}承認`, depts],
            ] as const
          ).map(([label, list]) => (
            <div key={label} className="rounded-lg border border-[#e5e5e5] p-3">
              <div className="mb-1.5 text-sm font-medium text-[#333333]">
                {label}
                <span className="ml-1 text-xs font-normal text-[#909090]">{list.length} 名</span>
              </div>
              {list.length === 0 ? (
                <div className="text-xs text-[#a0a0a0]">未指定（すべての管理者が承認できます）</div>
              ) : (
                <ul className="space-y-1 text-sm">
                  {list.map((e) => (
                    <li key={e.id}>
                      {e.name || "（氏名未登録）"}
                      <span className="ml-1 font-mono text-xs text-[#909090]">（{e.loginId}）</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <form
        action={upsertEmployeeAction}
        className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:grid-cols-5"
      >
        <div className="col-span-2 sm:col-span-5">
          <h2 className="text-sm font-bold text-[#333333]">社員を追加</h2>
          <p className="text-xs text-[#a0a0a0]">
            既に登録済みの社員番号を入力すると、その社員の内容を上書きします。登録後の修正は一覧の鉛筆アイコンから行えます。
          </p>
        </div>
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
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">承認{wf.buyerLabel}</label>
          <select name="buyerLoginId" className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm">
            <option value="">なし</option>
            {buyerCandidatesAll.map((c) => (
              <option key={c.loginId} value={c.loginId}>
                {c.name || c.loginId}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">承認{wf.mgrLabel}</label>
          <select name="mgrLoginId" className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm">
            <option value="">全{wf.mgrLabel}</option>
            {mgrCandidates.map((c) => (
              <option key={c.loginId} value={c.loginId}>
                {c.name || c.loginId}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">承認{wf.deptLabel}</label>
          <select name="deptLoginId" className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm">
            <option value="">全{wf.deptLabel}</option>
            {deptCandidates.map((c) => (
              <option key={c.loginId} value={c.loginId}>
                {c.name || c.loginId}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">メールアドレス</label>
          <input name="email" type="email" className="w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm" />
        </div>
        <div className="flex items-end">
          <button className="w-full rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]">
            登録 / 更新
          </button>
        </div>
      </form>

      <SearchBox action="/employees" q={q} placeholder="社員番号・氏名で検索" total={rows.length} />

      <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
              <th className="px-4 py-2.5 font-medium">社員番号</th>
              <th className="px-2 py-2.5 font-medium">氏名</th>
              <th className="px-2 py-2.5 font-medium">承認W/F</th>
              <th className="px-2 py-2.5 font-medium">権限</th>
              <th className="px-2 py-2.5 font-medium">承認{wf.buyerLabel}</th>
              <th className="px-2 py-2.5 font-medium">承認{wf.mgrLabel}</th>
              <th className="px-2 py-2.5 font-medium">承認{wf.deptLabel}</th>
              <th className="px-2 py-2.5 font-medium">メールアドレス</th>
              <th className="px-2 py-2.5 font-medium">ユーザー</th>
              <th className="px-2 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <EmployeeRow
                key={e.id}
                employee={e}
                buyerCandidates={buyerCandidatesAll.filter((c) => c.loginId !== e.loginId)}
                buyerLabel={wf.buyerLabel}
                mgrCandidates={mgrCandidates}
                deptCandidates={deptCandidates}
                mgrLabel={wf.mgrLabel}
                deptLabel={wf.deptLabel}
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-[#707070]">
            社員が登録されていません。上の「社員を追加」から登録してください。
          </p>
        )}
      </div>
    </div>
  );
}
