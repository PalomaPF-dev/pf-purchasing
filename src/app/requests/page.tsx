import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession, supplierScopeOf } from "@/lib/session";
import { approvalQueueFor, getWfSettings, listRequests } from "@/lib/db";
import type { ApprovalStage, RequestStatus } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import ReqNoSettings from "@/components/ReqNoSettings";
import RequestsTable from "@/components/RequestsTable";
import SearchBox from "@/components/SearchBox";

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

  const isAdmin = session.role === "admin";
  // 一般（バイヤー）は自分の担当取引先を含む申請のみ
  const scope = supplierScopeOf(session);
  const [requests, wf, queue] = await Promise.all([
    listRequests(session.companyId, {
      status: status || null,
      applicantLoginId: mine ? session.loginId : null,
      buyerLoginId: scope.buyerLoginId,
      q: q || null,
    }),
    getWfSettings(session.companyId),
    // 一覧からそのまま一括承認できるよう、自分がいま承認できる申請を調べる
    isAdmin
      ? approvalQueueFor(session.companyId, session.loginId)
      : Promise.resolve({ buyer: [], mgr: [], dept: [], hidden: 0 }),
  ]);
  const approvable: Record<string, ApprovalStage> = {};
  for (const r of queue.buyer) approvable[r.id] = "buyer";
  for (const r of queue.mgr) approvable[r.id] = "mgr";
  for (const r of queue.dept) approvable[r.id] = "dept";

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
          <div className="flex flex-wrap items-center gap-2">
          {session.role === "admin" && (
            <ReqNoSettings format={wf.reqFormat} reset={wf.reqReset} />
          )}
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]"
          >
            <Plus className="h-4 w-4" />
            新規申請
          </Link>
          </div>
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
                ? "bg-[#e11d48] text-white"
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
              ? "bg-[#e11d48] text-white"
              : "border border-[#e5e5e5] bg-white text-[#555555] hover:bg-[#f7f7f5]"
          }`}
        >
          自分の申請
        </Link>
        <SearchBox
          action="/requests"
          q={q}
          placeholder="品目CD・品名・取引先で検索"
          hidden={{ status: status || undefined, mine: mine ? "1" : undefined }}
          scope="prices"
          className="ml-auto"
        />
      </div>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#707070]">
          該当する申請がありません。
        </div>
      ) : (
        <RequestsTable
          requests={requests}
          approvable={approvable}
          stageLabels={{ buyer: wf.buyerLabel, mgr: wf.mgrLabel, dept: wf.deptLabel }}
          isAdmin={isAdmin}
          loginId={session.loginId}
        />
      )}
    </div>
  );
}

