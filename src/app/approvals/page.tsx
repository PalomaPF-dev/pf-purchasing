import { requireAdminPage } from "@/lib/session";
import { assignedApproverMap, canApproveRequest, getWfSettings, listRequests } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import BulkApprove from "@/components/BulkApprove";

export const dynamic = "force-dynamic";

/** 承認一覧（管理者）。段階ごとに一括承認・一括差し戻しができる。 */
export default async function ApprovalsPage() {
  const session = await requireAdminPage();
  const [wf, pendingAll, mgrApprovedAll, assigned] = await Promise.all([
    getWfSettings(session.companyId),
    listRequests(session.companyId, { status: "pending" }),
    listRequests(session.companyId, { status: "mgr_approved" }),
    assignedApproverMap(session.companyId),
  ]);
  // 申請者ごとに承認担当者が割り当てられている場合は、担当分だけを表示する
  const mine = (r: { applicantLoginId: string | null }, stage: "mgr" | "dept") =>
    canApproveRequest(wf, stage, session.loginId, assigned.get(r.applicantLoginId ?? "") ?? { mgr: null, dept: null });
  const pending = pendingAll.filter((r) => mine(r, "mgr"));
  const mgrApproved = mgrApprovedAll.filter((r) => mine(r, "dept"));
  const hiddenCount =
    pendingAll.length - pending.length + (mgrApprovedAll.length - mgrApproved.length);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="承認"
        description={
          wf.stages === 1
            ? `承認待ちの単価申請。${wf.mgrLabel}承認で確定し、単価履歴に反映されます。`
            : `承認待ちの単価申請。${wf.mgrLabel}承認 → ${wf.deptLabel}承認の2段階で承認され、${wf.deptLabel}承認で単価履歴に反映されます。${
                hiddenCount > 0 ? `（他の承認担当者が担当する ${hiddenCount} 件は表示していません）` : ""
              }`
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
