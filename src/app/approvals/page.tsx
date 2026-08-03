import { requireAdminPage } from "@/lib/session";
import { approvalQueueFor, getWfSettings } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import BulkApprove from "@/components/BulkApprove";

export const dynamic = "force-dynamic";

/** 承認一覧（管理者）。段階ごとに一括承認・一括差し戻しができる。 */
export default async function ApprovalsPage() {
  const session = await requireAdminPage();
  // 「いま自分で承認できる」申請だけを出す（判定はポータルのバッジと共通）
  const [wf, queue] = await Promise.all([
    getWfSettings(session.companyId),
    approvalQueueFor(session.companyId, session.loginId),
  ]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="承認"
        description={`承認待ちの単価申請。${wf.mgrLabel}承認 → ${wf.deptLabel}承認で承認され、${wf.deptLabel}承認で単価履歴に反映されます（申請者に${wf.buyerLabel}確認が設定されている場合は、その前に${wf.buyerLabel}確認が入ります）。${
          queue.hidden > 0 ? `他の承認担当者が担当する ${queue.hidden} 件は表示していません。` : ""
        }`}
      />
      <BulkApprove
        buyerStage={queue.buyer}
        pending={queue.mgr}
        mgrApproved={queue.dept}
        buyerLabel={wf.buyerLabel}
        mgrLabel={wf.mgrLabel}
        deptLabel={wf.deptLabel}
      />
    </div>
  );
}
