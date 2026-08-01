import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getRequest } from "@/lib/db";
import { formatDate, formatPrice } from "@/lib/format";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

/**
 * 単価申請書（登録品単価連絡書）。A4横・PDF保存用。
 * 現行の紙帳票にならい、1行＝1品番で「新単価」「旧単価」を左右に並べて新旧を対比する。
 * 右上に承認欄（部門長・MGR・担当）、左上に発注先。単価差の内訳は下部にまとめる。
 */
export default async function RequestPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const detail = await getRequest(session.companyId, id);
  if (!detail) notFound();
  const { request, lines, approvals } = detail;

  const mgr = [...approvals].reverse().find((a) => a.stage === "mgr" && a.action === "approve");
  const dept = [...approvals].reverse().find((a) => a.stage === "dept" && a.action === "approve");

  // 発注先は明細の先頭を代表として見出しに出す（複数取引先が混在する場合は各行にも表示される）
  const head = lines[0];
  const multiSupplier = lines.some((l) => l.supplierCd !== head?.supplierCd);

  // 内訳（改訂理由別）が1件でも入っていれば内訳表を出す
  const hasBreakdown = lines.some(
    (l) =>
      l.bdSupplyMat != null ||
      l.bdMaterial != null ||
      l.bdRevision != null ||
      l.bdDesign != null ||
      l.bdForex != null ||
      l.bdOther != null
  );

  return (
    <div className="min-h-screen bg-white">
      <style>{`@page { size: A4 landscape; margin: 10mm; }`}</style>

      <div className="no-print mx-auto flex max-w-5xl items-center justify-between p-4">
        <Link
          href={`/requests/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#e11d48] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          申請詳細に戻る
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-8 text-slate-900">
        {/* 上段: 発注先 / タイトル / 承認欄 */}
        <div className="mb-4 flex items-start justify-between gap-4">
          {/* 発注先 */}
          <table className="border-collapse">
            <tbody>
              <tr>
                <td className={`${th} w-24`}>発注先CD</td>
                <td className={`${th} w-56`}>発注先名</td>
              </tr>
              <tr>
                <td className={`${td} text-center font-mono`}>
                  {multiSupplier ? "（複数）" : head?.supplierCd ?? ""}
                </td>
                <td className={td}>{multiSupplier ? "明細参照" : head?.supplierName ?? ""}</td>
              </tr>
            </tbody>
          </table>

          <div className="pt-3 text-center">
            <h1 className="text-2xl font-bold tracking-[0.4em]">登録品単価連絡書</h1>
          </div>

          {/* 承認欄（発行日・部門長・MGR・担当） */}
          <div className="text-right">
            <div className="mb-1 text-xs text-slate-600">
              {request.reqNo != null ? `申請No: ${request.reqNo}` : "（下書き）"}
            </div>
            <table className="ml-auto border-collapse">
              <tbody>
                <tr>
                  <td className={`${th} w-24`}>発行日</td>
                  <td className={`${th} w-24`}>部門長</td>
                  <td className={`${th} w-24`}>MGR</td>
                  <td className={`${th} w-24`}>担当</td>
                </tr>
                <tr>
                  <td className={`${td} h-20 align-middle text-center text-[11px]`}>
                    {formatDate(request.submittedAt ?? request.createdAt)}
                  </td>
                  <ApprovalCell name={dept?.approverName} date={dept?.createdAt} />
                  <ApprovalCell name={mgr?.approverName} date={mgr?.createdAt} />
                  <ApprovalCell name={request.applicantName} date={request.submittedAt} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {request.title && (
          <p className="mb-2 text-sm">
            <span className="font-bold">件名:</span> {request.title}
          </p>
        )}

        {/* 明細（新単価 / 旧単価 の対比） */}
        <table className="print-table w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-[7%]`} rowSpan={2}>維持日</th>
              <th className={`${th} w-[10%]`} rowSpan={2}>品番</th>
              <th className={`${th} w-[8%]`} rowSpan={2}>納入場所</th>
              <th className={`${th} w-[16%]`} rowSpan={2}>品名</th>
              <th className={`${thNew} w-[28%]`} colSpan={4}>新 単 価</th>
              <th className={`${thOld} w-[21%]`} colSpan={4}>旧 単 価</th>
              <th className={`${th} w-[10%]`} rowSpan={2}>備考</th>
            </tr>
            <tr>
              <th className={thNew}>適用日</th>
              <th className={thNew}>支給単価</th>
              <th className={thNew}>単価</th>
              <th className={thNew}>買入単価</th>
              <th className={thOld}>取消日</th>
              <th className={thOld}>支給単価</th>
              <th className={thOld}>単価</th>
              <th className={thOld}>買入単価</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const isNew = l.currentPrice == null; // 旧単価なし = 新規登録品
              return (
                <tr key={l.id}>
                  <td className={`${td} text-center text-[11px]`}>
                    {formatDate(request.submittedAt ?? request.createdAt)}
                  </td>
                  <td className={`${td} font-mono`}>
                    {l.itemCd}
                    {l.itemBranch ? `-${l.itemBranch}` : ""}
                    {multiSupplier && (
                      <div className="text-[10px] text-slate-500">発注先 {l.supplierCd}</div>
                    )}
                  </td>
                  <td className={`${td} text-center font-mono text-[11px]`}>
                    {l.locCd ?? l.dlvCd ?? ""}
                  </td>
                  <td className={`${td} text-[11px]`}>{l.itemName ?? ""}</td>

                  {/* 新単価 */}
                  <td className={`${tdNew} text-center`}>{formatDate(l.startDate)}</td>
                  <td className={`${tdNew} text-right`}>{blank(l.paidSupplyPrice)}</td>
                  <td className={`${tdNew} text-right font-bold`}>{formatPrice(l.newPrice)}</td>
                  <td className={`${tdNew} text-right`}>{formatPrice(l.newPrice)}</td>

                  {/* 旧単価（新規登録品は空欄） */}
                  <td className={`${tdOld} text-center`}>{isNew ? "" : formatDate(dayBefore(l.startDate))}</td>
                  <td className={`${tdOld} text-right`}>{""}</td>
                  <td className={`${tdOld} text-right`}>{blank(l.currentPrice)}</td>
                  <td className={`${tdOld} text-right`}>{blank(l.currentPrice)}</td>

                  <td className={`${td} text-[10px]`}>
                    {isNew ? "新規登録" : ""}
                    {l.reasonNote ? (isNew ? " / " : "") + l.reasonNote : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 単価差の内訳（改訂理由別） */}
        {hasBreakdown && (
          <div className="mt-5">
            <h2 className="mb-1 text-sm font-bold">単価差の内訳</h2>
            <table className="print-table w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${th} w-[12%]`}>品番</th>
                  <th className={`${th} w-[10%]`}>単価差</th>
                  <th className={th}>支給材建値</th>
                  <th className={th}>材料建値</th>
                  <th className={th}>単価改定</th>
                  <th className={th}>設計変更</th>
                  <th className={th}>為替変動</th>
                  <th className={th}>その他</th>
                  <th className={`${th} w-[22%]`}>備考（改訂理由）</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const diff =
                    l.currentPrice != null
                      ? Math.round((l.newPrice - l.currentPrice) * 10000) / 10000
                      : null;
                  return (
                    <tr key={l.id}>
                      <td className={`${td} font-mono`}>
                        {l.itemCd}
                        {l.itemBranch ? `-${l.itemBranch}` : ""}
                      </td>
                      <td className={`${td} text-right font-bold`}>{blank(diff)}</td>
                      <td className={`${td} text-right`}>{blank(l.bdSupplyMat)}</td>
                      <td className={`${td} text-right`}>{blank(l.bdMaterial)}</td>
                      <td className={`${td} text-right`}>{blank(l.bdRevision)}</td>
                      <td className={`${td} text-right`}>{blank(l.bdDesign)}</td>
                      <td className={`${td} text-right`}>{blank(l.bdForex)}</td>
                      <td className={`${td} text-right`}>{blank(l.bdOther)}</td>
                      <td className={`${td} text-[10px]`}>{l.reasonNote ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 text-[10px] text-slate-500">
          ※ 全 {lines.length} 明細。買入単価は購入単価と同額（有償支給がある場合は支給単価を別途記載）。
        </div>
      </div>
    </div>
  );
}

/* ===== スタイル・小物 ===== */

const th =
  "print-keep-bg border border-slate-500 bg-slate-100 px-2 py-1 text-center text-[11px] font-bold text-slate-700";
const thNew =
  "print-keep-bg border border-slate-500 bg-rose-50 px-2 py-1 text-center text-[11px] font-bold text-rose-800";
const thOld =
  "print-keep-bg border border-slate-500 bg-slate-50 px-2 py-1 text-center text-[11px] font-bold text-slate-600";
const td = "border border-slate-400 px-2 py-1 text-[12px] align-top";
const tdNew = "border border-slate-400 px-2 py-1 text-[12px] font-mono align-top";
const tdOld = "border border-slate-400 px-2 py-1 text-[12px] font-mono align-top text-slate-600";

/** 未設定は空欄（帳票では 0 と区別する） */
function blank(v: number | null | undefined): string {
  return v == null ? "" : formatPrice(v);
}

/** YYYY-MM-DD の前日（旧単価の取消日＝新単価適用日の前日） */
function dayBefore(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function stampDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `'${String(jst.getUTCFullYear()).slice(2)}.${jst.getUTCMonth() + 1}.${jst.getUTCDate()}`;
}

/** 承認印セル（未承認は空欄） */
function ApprovalCell({
  name,
  date,
}: {
  name: string | null | undefined;
  date: string | null | undefined;
}) {
  return (
    <td className="h-20 border border-slate-500 p-1 text-center align-middle">
      {name ? (
        <div className="mx-auto flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-red-600 text-red-600">
          <div className="max-w-14 truncate text-[10px] leading-tight">{name}</div>
          <div className="text-[9px]">{stampDate(date)}</div>
        </div>
      ) : (
        <div className="h-16" />
      )}
    </td>
  );
}
