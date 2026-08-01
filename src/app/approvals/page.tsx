import { requireAdminPage } from "@/lib/session";
import {
  assignedApproverMap,
  canApproveRequest,
  getWfSettings,
  listRequests,
  NO_ASSIGNED,
} from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import BulkApprove from "@/components/BulkApprove";

export const dynamic = "force-dynamic";

/** 承認一覧（管理者）。段階ごとに一括承認・一括差し戻しができる。 */
export default async function ApprovalsPage() {
  const session = await requireAdminPage();
  const [wf, pendingAll, buyerApprovedAll, mgrApprovedAll, assigned] = await Promise.all([
    getWfSettings(session.companyId),
    listRequests(session.companyId, { status: "pending" }),
    listRequests(session.companyId, { status: "buyer_approved" }),
    listRequests(session.companyId, { status: "mgr_approved" }),
    assignedApproverMap(session.companyId),
  ]);
  const at = (r: { applicantLoginId: string | null }) =>
    assigned.get(r.applicantLoginId ?? "") ?? NO_ASSIGNED;
  // 申請者ごとに承認担当者が割り当てられている場合は、担当分だけを表示する
  const mine = (r: { applicantLoginId: string | null }, stage: "buyer" | "mgr" | "dept") =>
    canApproveRequest(wf, stage, session.loginId, at(r));
  // pending は「バイヤー確認待ち」か「MGR承認待ち」か（申請者の割当で決まる）
  const buyerPending = pendingAll.filter((r) => at(r).buyer);
  const mgrPending = [...pendingAll.filter((r) => !at(r).buyer), ...buyerApprovedAll];
  const buyerStage = buyerPending.filter((r) => mine(r, "buyer"));
  const pending = mgrPending.filter((r) => mine(r, "mgr"));
  const mgrApproved = mgrApprovedAll.filter((r) => mine(r, "dept"));
  const hiddenCount =
    buyerPending.length - buyerStage.length +
    (mgrPending.length - pending.length) +
    (mgrApprovedAll.length - mgrApproved.length);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="承認"
        description={`承認待ちの単価申請。${wf.mgrLabel}承認 → ${wf.deptLabel}承認で承認され、${wf.deptLabel}承認で単価履歴に反映されます（申請者に${wf.buyerLabel}確認が設定されている場合は、その前に${wf.buyerLabel}確認が入ります）。${
          hiddenCount > 0 ? `他の承認担当者が担当する ${hiddenCount} 件は表示していません。` : ""
        }`}
      />
      <BulkApprove
        buyerStage={buyerStage}
        pending={pending}
        mgrApproved={mgrApproved}
        buyerLabel={wf.buyerLabel}
        mgrLabel={wf.mgrLabel}
        deptLabel={wf.deptLabel}
      />
    </div>
  );
}
