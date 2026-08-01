import { requireAdminPage } from "@/lib/session";
import { getWfSettings, listRequests } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import BulkApprove from "@/components/BulkApprove";

export const dynamic = "force-dynamic";

/** 承認一覧（管理者）。段階ごとに一括承認・一括差し戻しができる。 */
export default async function ApprovalsPage() {
  const session = await requireAdminPage();
  const [wf, pending, mgrApproved] = await Promise.all([
    getWfSettings(session.companyId),
    listRequests(session.companyId, { status: "pending" }),
    listRequests(session.companyId, { status: "mgr_approved" }),
  ]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="承認"
        description={
          wf.stages === 1
            ? `承認待ちの単価申請。${wf.mgrLabel}承認で確定し、単価履歴に反映されます。`
            : `承認待ちの単価申請。${wf.mgrLabel}承認 → ${wf.deptLabel}承認の2段階で承認され、${wf.deptLabel}承認で単価履歴に反映されます。`
        }
      />
      <BulkApprove
        pending={pending}
        mgrApproved={mgrApproved}
        mgrLabel={wf.mgrLabel}
        deptLabel={wf.deptLabel}
        stages={wf.stages}
      />
    </div>
  );
}
