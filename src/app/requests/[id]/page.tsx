import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Pencil, Printer } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getRequest } from "@/lib/db";
import { APPROVAL_STAGE_LABEL, REQUEST_STATUS_LABEL } from "@/lib/types";
import { formatDate, formatDateTime, formatDiff, formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import ApprovalActions from "@/components/ApprovalActions";
import { MessageForm, SubmitDeleteActions } from "@/components/RequestDetailActions";

export const dynamic = "force-dynamic";

/** 単価申請の詳細（明細・承認状況・スレッド・操作） */
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const detail = await getRequest(session.companyId, id);
  if (!detail) notFound();
  const { request, lines, approvals, messages } = detail;

  const isAdmin = session.role === "admin";
  const editable = request.status === "draft" || request.status === "rejected";
  const approvable =
    isAdmin && (request.status === "pending" || request.status === "mgr_approved");
  const stage = request.status === "pending" ? ("mgr" as const) : ("dept" as const);

  const statusColor =
    request.status === "approved"
      ? "bg-emerald-50 text-emerald-700"
      : request.status === "rejected"
        ? "bg-red-50 text-red-700"
        : request.status === "draft"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-50 text-amber-700";

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link
        href="/requests"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#e11d48] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        申請一覧に戻る
      </Link>

      <PageHeader
        title={`単価申請 ${request.reqNo != null ? `#${request.reqNo}` : "（下書き）"}`}
        description={request.title ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusColor}`}>
              {REQUEST_STATUS_LABEL[request.status]}
            </span>
            {editable && (
              <Link
                href={`/requests/${request.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm font-medium text-[#555555] hover:bg-[#f7f7f5]"
              >
                <Pencil className="h-4 w-4" />
                編集
              </Link>
            )}
            {/* 承認済みなら、この申請ぶんのMC取込CSVをそのまま出力できる */}
            {request.status === "approved" && isAdmin && (
              <Link
                href={`/export?request=${request.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#e11d48] px-3 py-1.5 text-sm font-medium text-[#e11d48] hover:bg-[#fff1f2]"
              >
                <Download className="h-4 w-4" />
                MC取込CSV出力
              </Link>
            )}
            <Link
              href={`/requests/${request.id}/print`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#e11d48] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#be123c]"
            >
              <Printer className="h-4 w-4" />
              承認用紙（PDF）
            </Link>
          </div>
        }
      />

      {/* 申請情報 */}
      <div className="mb-4 grid gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-[#707070]">申請者</div>
          <div className="font-medium">
            {request.applicantName ?? "—"}
            {request.applicantLoginId && (
              <span className="ml-1 text-xs text-[#707070]">({request.applicantLoginId})</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-[#707070]">提出日時</div>
          <div className="font-medium">{formatDateTime(request.submittedAt)}</div>
        </div>
        <div>
          <div className="text-xs text-[#707070]">MGR承認</div>
          <ApprovalCell approvals={approvals} stage="mgr" />
        </div>
        <div>
          <div className="text-xs text-[#707070]">部門長承認</div>
          <ApprovalCell approvals={approvals} stage="dept" />
        </div>
      </div>

      {/* 承認操作 */}
      {approvable && (
        <div className="mb-4">
          <ApprovalActions
            requestId={request.id}
            stage={stage}
            stageLabel={APPROVAL_STAGE_LABEL[stage]}
          />
        </div>
      )}
      {editable && (
        <div className="mb-4">
          <SubmitDeleteActions requestId={request.id} />
        </div>
      )}

      {/* 明細 */}
      <div className="mb-4 overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead>
            {/* 新単価・旧単価をグループ化して新旧を対比（帳票と同じ並び） */}
            <tr className="border-b border-[#eeeeee] text-center text-xs">
              <th className="px-3 py-1.5" colSpan={4}></th>
              <th className="border-l border-[#eeeeee] bg-rose-50 px-2 py-1.5 font-bold text-rose-800" colSpan={3}>
                新 単 価
              </th>
              <th className="border-l border-[#eeeeee] bg-slate-50 px-2 py-1.5 font-bold text-slate-600" colSpan={2}>
                旧 単 価
              </th>
              <th className="border-l border-[#eeeeee] px-2 py-1.5" colSpan={2}></th>
            </tr>
            <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-2 py-2.5 font-medium">品目CD / 品名</th>
              <th className="px-2 py-2.5 font-medium">発注先</th>
              <th className="px-2 py-2.5 font-medium">納入場所</th>
              <th className="border-l border-[#eeeeee] bg-rose-50/40 px-2 py-2.5 font-medium">適用日</th>
              <th className="bg-rose-50/40 px-2 py-2.5 text-right font-medium">単価</th>
              <th className="bg-rose-50/40 px-2 py-2.5 text-right font-medium">支給単価</th>
              <th className="border-l border-[#eeeeee] bg-slate-50/60 px-2 py-2.5 font-medium">取消日</th>
              <th className="bg-slate-50/60 px-2 py-2.5 text-right font-medium">単価</th>
              <th className="border-l border-[#eeeeee] px-2 py-2.5 text-right font-medium">単価差</th>
              <th className="px-2 py-2.5 font-medium">備考（理由）</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const diff =
                l.currentPrice != null ? Math.round((l.newPrice - l.currentPrice) * 10000) / 10000 : null;
              return (
                <tr key={l.id} className="border-b border-[#f5f5f5] align-top">
                  <td className="px-3 py-2.5 text-xs text-[#707070]">{l.seq}</td>
                  <td className="px-2 py-2.5">
                    <div className="font-mono">{l.itemCd}{l.itemBranch ? `-${l.itemBranch}` : ""}</div>
                    <div className="text-xs text-[#707070]">{l.itemName ?? ""}</div>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="font-mono">{l.supplierCd}</span>
                    <div className="text-xs text-[#707070]">{l.supplierName ?? ""}</div>
                  </td>
                  <td className="px-2 py-2.5 text-xs">
                    {l.locCd ? `${l.locCd} ${l.locName ?? ""}` : "—"}
                  </td>
                  {/* 新単価 */}
                  <td className="border-l border-[#f0f0f0] bg-rose-50/40 px-2 py-2.5">
                    {formatDate(l.startDate)}
                  </td>
                  <td className="bg-rose-50/40 px-2 py-2.5 text-right font-mono font-bold">
                    {formatPrice(l.newPrice)}
                  </td>
                  <td className="bg-rose-50/40 px-2 py-2.5 text-right font-mono text-xs">
                    {l.paidSupplyPrice != null ? formatPrice(l.paidSupplyPrice) : "—"}
                  </td>
                  {/* 旧単価（新規登録品は空欄） */}
                  <td className="border-l border-[#f0f0f0] bg-slate-50/60 px-2 py-2.5 text-xs text-[#707070]">
                    {l.currentPrice == null ? (
                      <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        新規
                      </span>
                    ) : (
                      formatDate(dayBefore(l.startDate))
                    )}
                  </td>
                  <td className="bg-slate-50/60 px-2 py-2.5 text-right font-mono text-[#707070]">
                    {formatPrice(l.currentPrice)}
                  </td>
                  <td
                    className={`border-l border-[#f0f0f0] px-2 py-2.5 text-right font-mono ${
                      diff != null && diff > 0 ? "text-red-600" : diff != null && diff < 0 ? "text-emerald-600" : ""
                    }`}
                  >
                    {formatDiff(diff)}
                  </td>
                  <td className="px-2 py-2.5 text-xs">{l.reasonNote ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 承認スレッド */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-[#333333]">コメント・履歴</h2>
        {messages.length === 0 ? (
          <p className="mb-3 text-sm text-[#707070]">まだコメントはありません。</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.isSystem ? "bg-[#f8fafc] text-[#707070]" : "bg-[#fff1f2]"
                }`}
              >
                <div className="mb-0.5 text-xs text-[#9a9a9a]">
                  {m.authorName ?? "システム"}・{formatDateTime(m.createdAt)}
                </div>
                {m.body}
              </li>
            ))}
          </ul>
        )}
        <MessageForm requestId={request.id} />
      </section>
    </div>
  );
}

/** YYYY-MM-DD の前日（旧単価の取消日＝新単価適用日の前日） */
function dayBefore(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function ApprovalCell({
  approvals,
  stage,
}: {
  approvals: { stage: string; action: string; approverName: string | null; createdAt: string }[];
  stage: "mgr" | "dept";
}) {
  const a = [...approvals].reverse().find((x) => x.stage === stage);
  if (!a) return <div className="font-medium text-[#a0a0a0]">未承認</div>;
  return (
    <div className={`font-medium ${a.action === "approve" ? "text-emerald-700" : "text-red-600"}`}>
      {a.action === "approve" ? "承認" : "差戻"}: {a.approverName ?? "—"}
      <div className="text-xs font-normal text-[#707070]">{formatDateTime(a.createdAt)}</div>
    </div>
  );
}
