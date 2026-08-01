import { requireAdminPage } from "@/lib/session";
import { getWfSettings } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import WfSettingsForm from "@/components/WfSettingsForm";

export const dynamic = "force-dynamic";

/** 承認ワークフロー設定（管理者のみ） */
export default async function SettingsPage() {
  const session = await requireAdminPage();
  const wf = await getWfSettings(session.companyId);
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageHeader
        title="承認ワークフロー設定"
        description="単価申請の承認段階・承認者・段階名称を設定します。変更は以後の承認から適用されます（申請中のものも含む）。"
      />
      <WfSettingsForm initial={wf} />
    </div>
  );
}
