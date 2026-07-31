import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession } from "@/lib/session";
import { listRequests } from "@/lib/db";
import { REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string }[] = [
  { key: "", label: "すべて" },
  { key: "draft", label: "下書き" },
  { key: "awaiting", label: "承認待ち" },
  { key: "approved", label: "承認済" },
  { key: "rejected", label: "差し戻し" },
];

/** 単価申請の一覧（検索・状態タブ・自分の申請） */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; mine?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const status = (sp.status ?? "") as RequestStatus | "awaiting" | "";
  const mine = sp.mine === "1";
  const q = sp.q ?? "";

  const requests = await listRequests(session.companyId, {
    status: status || null,
    applicantLoginId: mine ? session.loginId : null,
    q: q || null,
  });

  const qsOf = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = { status, q, mine: mine ? "1" : "", ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="単価申請"
        description="購入品単価の申請一覧。申請はMGR→部門長の2段階で承認されます。"
        actions={
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4fd8]"
          >
            <Plus className="h-4 w-4" />
            新規申請
          </Link>
        }
      />

      {/* タブ + 検索 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/requests${qsOf({ status: t.key })}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              status === t.key
                ? "bg-[#2563eb] text-white"
                : "border border-[#e5e5e5] bg-white text-[#555555] hover:bg-[#f7f7f5]"
            }`}
          >
            {t.label}
          </Link>
        ))}
        <Link
          href={`/requests${qsOf({ mine: mine ? "" : "1" })}`}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            mine
              ? "bg-[#2563eb] text-white"
              : "border border-[#e5e5e5] bg-white text-[#555555] hover:bg-[#f7f7f5]"
          }`}
        >
          自分の申請
        </Link>
        <form className="ml-auto" action="/requests" method="GET">
          {status && <input type="hidden" name="status" value={status} />}
          {mine && <input type="hidden" name="mine" value="1" />}
          <input
            name="q"
            defaultValue={q}
            placeholder="品目CD・品名・発注先で検索"
            className="w-64 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#2563eb] focus:outline-none"
          />
        </form>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#707070]">
          該当する申請がありません。
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
                <th className="px-2 py-2.5 font-medium">状態</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-[#f5f5f5] hover:bg-[#f7f7f5]">
                  <td className="px-4 py-2.5 font-mono">
                    <Link href={`/requests/${r.id}`} className="font-semibold text-[#2563eb] hover:underline">
                      {r.reqNo != null ? `#${r.reqNo}` : "（下書き）"}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    <Link href={`/requests/${r.id}`} className="hover:underline">
                      {r.title || r.supplierSummary || "—"}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">{r.lineCount ?? 0} 件</td>
                  <td className="px-2 py-2.5">{r.applicantName ?? "—"}</td>
                  <td className="px-2 py-2.5 text-xs">{formatDateTime(r.submittedAt ?? r.createdAt)}</td>
                  <td className="px-2 py-2.5">
                    <StatusBadge status={r.status} />
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

function StatusBadge({ status }: { status: RequestStatus }) {
  const color =
    status === "approved"
      ? "bg-emerald-50 text-emerald-700"
      : status === "rejected"
        ? "bg-red-50 text-red-700"
        : status === "draft"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-50 text-amber-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}
