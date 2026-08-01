import { requireAdminPage } from "@/lib/session";
import { getWfSettings, listEmployees } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import WfSettingsForm from "@/components/WfSettingsForm";

export const dynamic = "force-dynamic";

/** 承認ワークフロー設定（管理者のみ） */
export default async function SettingsPage() {
  const session = await requireAdminPage();
  const [wf, employees] = await Promise.all([
    getWfSettings(session.companyId),
    listEmployees(session.companyId),
  ]);
  // 承認者は社員マスタの「承認W/F」で管理する。氏名を添えて表示する
  const byId = new Map(employees.map((e) => [e.loginId, e.name]));
  const toInfo = (ids: string[]) => ids.map((loginId) => ({ loginId, name: byId.get(loginId) ?? "" }));
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageHeader
        title="承認ワークフロー設定"
        description="単価申請の承認は「MGR承認 → 部門長承認」の2段階です。段階の名称を設定できます。承認者は「ユーザー登録」の承認W/Fで指定します。"
      />
      <WfSettingsForm
        initial={wf}
        mgrApprovers={toInfo(wf.mgrApprovers)}
        deptApprovers={toInfo(wf.deptApprovers)}
      />
    </div>
  );
}
