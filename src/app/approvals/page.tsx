import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { listRequests } from "@/lib/db";
import { REQUEST_STATUS_LABEL } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/** 承認一覧（管理者）。MGR承認待ち・部門長承認待ちの申請を処理する。 */
export default async function ApprovalsPage() {
  const session = await requireAdminPage();
  const awaiting = await listRequests(session.companyId, { status: "awaiting" });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="承認"
        description="承認待ちの単価申請。MGR承認 → 部門長承認の2段階で承認され、部門長承認で単価履歴に反映されます。"
      />
      {awaiting.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#707070]">
          承認待ちの申請はありません。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
                <th className="px-4 py-2.5 font-medium">申請No</th>
                <th className="px-2 py-2.5 font-medium">タイトル / 発注先</th>
                <th className="px-2 py-2.5 font-medium">明細</th>
                <th className="px-2 py-2.5 font-medium">申請者</th>
                <th className="px-2 py-2.5 font-medium">提出日時</th>
                <th className="px-2 py-2.5 font-medium">承認段階</th>
              </tr>
            </thead>
            <tbody>
              {awaiting.map((r) => (
                <tr key={r.id} className="border-b border-[#f5f5f5] hover:bg-[#f7f7f5]">
                  <td className="px-4 py-2.5 font-mono">
                    <Link href={`/requests/${r.id}`} className="font-semibold text-[#e11d48] hover:underline">
                      #{r.reqNo}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    <Link href={`/requests/${r.id}`} className="hover:underline">
                      {r.title || r.supplierSummary || "—"}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">{r.lineCount ?? 0} 件</td>
                  <td className="px-2 py-2.5">{r.applicantName ?? "—"}</td>
                  <td className="px-2 py-2.5 text-xs">{formatDateTime(r.submittedAt)}</td>
                  <td className="px-2 py-2.5">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {REQUEST_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
