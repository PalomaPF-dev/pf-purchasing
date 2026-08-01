import Link from "next/link";
import {
  FileText,
  Stamp,
  History,
  Package,
  Building2,
  Download,
  Plus,
  ArrowRight,
} from "lucide-react";
import { requireSession, supplierScopeOf } from "@/lib/session";
import { dashboardStats, getWfSettings, listRequests, listPrices } from "@/lib/db";
import { hasDatabase } from "@/lib/neon";
import { REQUEST_STATUS_LABEL } from "@/lib/types";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/** ダッシュボード: 承認待ち・自分の申請・最近の改訂の見える化。 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ forbidden?: string }>;
}) {
  const sp = await searchParams;
  const forbidden = sp.forbidden === "1";
  if (!hasDatabase()) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <p className="font-bold">初期セットアップが必要です</p>
          <p className="mt-2">
            環境変数 <code className="rounded bg-white px-1">DATABASE_URL</code>（Neon Postgres）と
            <code className="rounded bg-white px-1">NEXTAUTH_SECRET</code> を設定してください。
            詳しくは README を参照してください。
          </p>
        </div>
      </div>
    );
  }
  const session = await requireSession();
  const { companyId, role, loginId } = session;
  const isAdmin = role === "admin";

  // 一般（バイヤー）は自分の担当取引先の範囲だけを表示する
  const scope = supplierScopeOf(session);
  const [stats, wf, myRequests, awaiting, recent] = await Promise.all([
    dashboardStats(companyId),
    getWfSettings(companyId),
    listRequests(companyId, { applicantLoginId: loginId, buyerLoginId: scope.buyerLoginId, limit: 5 }),
    isAdmin ? listRequests(companyId, { status: "awaiting", limit: 5 }) : Promise.resolve([]),
    listPrices(companyId, { buyerLoginId: scope.buyerLoginId, limit: 8 }),
  ]);

  const cards = [
    { label: `${wf.mgrLabel}承認待ち`, value: stats.pendingCount, href: "/approvals", accent: "text-amber-600" },
    ...(wf.stages === 2
      ? [{ label: `${wf.deptLabel}承認待ち`, value: stats.mgrApprovedCount, href: "/approvals", accent: "text-amber-600" }]
      : []),
    { label: "今月の承認済", value: stats.approvedThisMonth, href: "/requests?status=approved", accent: "text-emerald-600" },
    { label: "MC未出力明細", value: stats.unexportedCount, href: "/export", accent: "text-rose-600" },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="ダッシュボード"
        description="購入品単価の申請・承認・改訂履歴・mcframe連携"
        actions={
          <Link
            href="/requests/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]"
          >
            <Plus className="h-4 w-4" />
            単価申請を作成
          </Link>
        }
      />

      {/* 管理者専用ページへアクセスした一般ユーザーへの案内 */}
      {forbidden && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">このページは管理者のみ利用できます</p>
          <p className="mt-1">
            現在のアカウント（{session.userName || loginId || "—"}）は一般権限のため、マスタ管理・一括取込・
            MC取込出力・データ移行は開けません。ポータルの管理画面で役割を「管理者」に変更後、
            ポータルからこのアプリを開き直すと反映されます。
          </p>
        </div>
      )}

      {/* ステータスカード */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl border border-[#e5e5e5] bg-white p-4 transition-shadow hover:shadow-sm"
          >
            <div className="text-xs text-[#707070]">{c.label}</div>
            <div className={`mt-1 text-2xl font-bold ${c.accent}`}>{c.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 承認待ち（管理者のみ） */}
        {isAdmin && (
          <section className="rounded-xl border border-[#e5e5e5] bg-white">
            <div className="flex items-center justify-between border-b border-[#eeeeee] px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#333333]">
                <Stamp className="h-4 w-4 text-[#e11d48]" />
                承認待ちの申請
              </h2>
              <Link href="/approvals" className="flex items-center gap-1 text-xs text-[#e11d48] hover:underline">
                すべて見る <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {awaiting.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[#707070]">承認待ちの申請はありません。</p>
            ) : (
              <ul className="divide-y divide-[#f0f0f0]">
                {awaiting.map((r) => (
                  <li key={r.id}>
                    <Link href={`/requests/${r.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-[#f7f7f5]">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[#333333]">
                          {r.reqCode ? `申請 ${r.reqCode}` : "申請"}
                          {r.title ? ` ${r.title}` : ""}
                          <span className="ml-2 text-xs text-[#707070]">
                            {r.supplierSummary ?? ""}（{r.lineCount ?? 0}件）
                          </span>
                        </div>
                        <div className="text-xs text-[#707070]">
                          {r.applicantName ?? "—"}・{formatDateTime(r.submittedAt)}
                        </div>
                      </div>
                      <span className="ml-3 shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {REQUEST_STATUS_LABEL[r.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* 自分の申請 */}
        <section className="rounded-xl border border-[#e5e5e5] bg-white">
          <div className="flex items-center justify-between border-b border-[#eeeeee] px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#333333]">
              <FileText className="h-4 w-4 text-[#e11d48]" />
              自分の申請
            </h2>
            <Link href="/requests?mine=1" className="flex items-center gap-1 text-xs text-[#e11d48] hover:underline">
              すべて見る <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {myRequests.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[#707070]">まだ申請がありません。</p>
          ) : (
            <ul className="divide-y divide-[#f0f0f0]">
              {myRequests.map((r) => (
                <li key={r.id}>
                  <Link href={`/requests/${r.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-[#f7f7f5]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[#333333]">
                        {r.reqCode ?? "下書き"}
                        {r.title ? ` ${r.title}` : ""}
                        <span className="ml-2 text-xs text-[#707070]">（{r.lineCount ?? 0}件）</span>
                      </div>
                      <div className="text-xs text-[#707070]">{formatDateTime(r.submittedAt ?? r.createdAt)}</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 最近の単価改訂 */}
        <section className="rounded-xl border border-[#e5e5e5] bg-white lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[#eeeeee] px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#333333]">
              <History className="h-4 w-4 text-[#e11d48]" />
              単価履歴（最新）
            </h2>
            <Link href="/prices" className="flex items-center gap-1 text-xs text-[#e11d48] hover:underline">
              単価履歴を見る <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recent.rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[#707070]">
              単価データがありません。<Link href="/migrate" className="text-[#e11d48] hover:underline">データ移行</Link>から現行の単価履歴を取り込めます。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
                    <th className="px-4 py-2 font-medium">品目CD</th>
                    <th className="px-2 py-2 font-medium">品名</th>
                    <th className="px-2 py-2 font-medium">取引先</th>
                    <th className="px-2 py-2 text-right font-medium">単価</th>
                    <th className="px-2 py-2 font-medium">適用開始</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.rows.map((p) => (
                    <tr key={p.id} className="border-b border-[#f5f5f5]">
                      <td className="px-4 py-2 font-mono">
                        <Link href={`/prices/${encodeURIComponent(p.itemCd)}?supplier=${encodeURIComponent(p.supplierCd)}`} className="text-[#e11d48] hover:underline">
                          {p.itemCd}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{p.itemName || "—"}</td>
                      <td className="px-2 py-2">
                        <span className="font-mono">{p.supplierCd}</span> {p.supplierName ?? ""}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{formatPrice(p.price)}</td>
                      <td className="px-2 py-2">{formatDate(p.startDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* マスタ状況（管理者向けフッタ） */}
      {isAdmin && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link href="/items" className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4 hover:shadow-sm">
            <Package className="h-5 w-5 text-[#e11d48]" />
            <div>
              <div className="text-xs text-[#707070]">品番マスタ</div>
              <div className="text-sm font-bold">{stats.itemCount.toLocaleString()} 件</div>
            </div>
          </Link>
          <Link href="/suppliers" className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4 hover:shadow-sm">
            <Building2 className="h-5 w-5 text-[#e11d48]" />
            <div>
              <div className="text-xs text-[#707070]">取引先マスタ</div>
              <div className="text-sm font-bold">{stats.supplierCount.toLocaleString()} 件</div>
            </div>
          </Link>
          <Link href="/prices" className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4 hover:shadow-sm">
            <History className="h-5 w-5 text-[#e11d48]" />
            <div>
              <div className="text-xs text-[#707070]">単価履歴</div>
              <div className="text-sm font-bold">{stats.historyCount.toLocaleString()} 件</div>
            </div>
          </Link>
          <Link href="/export" className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4 hover:shadow-sm">
            <Download className="h-5 w-5 text-[#e11d48]" />
            <div>
              <div className="text-xs text-[#707070]">MC未出力</div>
              <div className="text-sm font-bold">{stats.unexportedCount.toLocaleString()} 件</div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: keyof typeof REQUEST_STATUS_LABEL }) {
  const color =
    status === "approved"
      ? "bg-emerald-50 text-emerald-700"
      : status === "rejected"
        ? "bg-red-50 text-red-700"
        : status === "draft"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-50 text-amber-700";
  return (
    <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}
