import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getRequest, previousHistoryFor, requestLineDetail } from "@/lib/db";
import type { PriceHistoryRow, PriceRequestLine } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/format";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

interface PrevInfo {
  history: PriceHistoryRow | null;
  line: PriceRequestLine | null;
  applicant: { loginId: string | null; name: string | null; date: string | null } | null;
}

/**
 * 承認用紙「単価申請内訳」（A4横・PDF保存用）。
 * 現行の紙帳票のレイアウトを踏襲：ヘッダ（発注先CD・品目CD）、申請内容、直近申請内容、
 * 右上に 部門長／MGR／担当 の承認印（承認済みの場合は氏名・日付入り）。
 * 明細ごとに1ページ出力する。
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

  // 各明細の「直近申請内容」（同一キーの直前の履歴 + その申請情報）
  const prevs: PrevInfo[] = await Promise.all(
    lines.map(async (l) => {
      const history = await previousHistoryFor(session.companyId, {
        itemCd: l.itemCd,
        itemBranch: l.itemBranch,
        supplierCd: l.supplierCd,
        locCd: l.locCd,
        dlvCd: l.dlvCd,
        startDate: l.startDate,
        requestLineId: l.id,
      });
      if (!history?.requestLineId) return { history, line: null, applicant: null };
      const rl = await requestLineDetail(session.companyId, history.requestLineId);
      return {
        history,
        line: rl?.line ?? null,
        applicant: rl
          ? {
              loginId: rl.request.applicantLoginId,
              name: rl.request.applicantName,
              date: rl.request.submittedAt,
            }
          : null,
      };
    })
  );

  const mgr = [...approvals].reverse().find((a) => a.stage === "mgr" && a.action === "approve");
  const dept = [...approvals].reverse().find((a) => a.stage === "dept" && a.action === "approve");

  return (
    <div className="min-h-screen bg-white">
      <style>{`@page { size: A4 landscape; margin: 10mm; } @media print { .sheet { page-break-after: always; } .sheet:last-child { page-break-after: auto; } }`}</style>

      <div className="no-print mx-auto flex max-w-5xl items-center justify-between p-4">
        <Link
          href={`/requests/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2563eb] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          申請詳細に戻る
        </Link>
        <PrintButton />
      </div>

      {lines.map((l, i) => (
        <Sheet
          key={l.id}
          line={l}
          prev={prevs[i]}
          reqNo={request.reqNo}
          applicant={{
            name: request.applicantName,
            loginId: request.applicantLoginId,
            date: request.submittedAt,
          }}
          mgr={mgr ? { name: mgr.approverName, date: mgr.createdAt } : null}
          dept={dept ? { name: dept.approverName, date: dept.createdAt } : null}
          pageNo={i + 1}
          pageTotal={lines.length}
        />
      ))}
    </div>
  );
}

function stampDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `'${String(jst.getUTCFullYear()).slice(2)}.${jst.getUTCMonth() + 1}.${jst.getUTCDate()}`;
}

/** 承認印（丸印風）。未承認は空欄。 */
function Stamp({
  title,
  name,
  date,
}: {
  title: string;
  name: string | null | undefined;
  date: string | null | undefined;
}) {
  return (
    <div className="w-24 border border-slate-500 text-center">
      <div className="print-keep-bg border-b border-slate-500 bg-slate-100 py-0.5 text-[11px] font-bold">
        {title}
      </div>
      <div className="flex h-20 items-center justify-center p-1">
        {name ? (
          <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-red-600 text-red-600">
            <div className="max-w-14 truncate text-[10px] leading-tight">{name}</div>
            <div className="text-[9px]">{stampDate(date)}</div>
          </div>
        ) : (
          <div className="h-16 w-16" />
        )}
      </div>
    </div>
  );
}

const th = "print-keep-bg bg-slate-100 px-2 py-1 text-center text-[11px] font-bold text-slate-700";
const td = "px-2 py-1 text-right text-[12px] font-mono";

/** 申請内容ブロック（申請内容／直近申請内容 共通レイアウト） */
function ContentBlock({
  heading,
  procId,
  startDate,
  locCd,
  locName,
  empNo,
  empName,
  lot,
  currentPrice,
  newPrice,
  paidSupply,
  diff,
  bdSupplyMat,
  bdMaterial,
  bdRevision,
  bdDesign,
  bdForex,
  bdOther,
  note,
}: {
  heading: string;
  procId: string;
  startDate: string | null;
  locCd: string | null;
  locName: string | null;
  empNo: string | null;
  empName: string | null;
  lot: number | null;
  currentPrice: number | null;
  newPrice: number | null;
  paidSupply: number | null;
  diff: number | null;
  bdSupplyMat: number | null;
  bdMaterial: number | null;
  bdRevision: number | null;
  bdDesign: number | null;
  bdForex: number | null;
  bdOther: number | null;
  note: string | null;
}) {
  const fp = (v: number | null) => (v == null ? "" : formatPrice(v));
  return (
    <div className="mb-4 border-t border-dashed border-slate-400 pt-2">
      <div className="mb-1 flex items-center gap-6">
        <span className="print-keep-bg bg-slate-200 px-6 py-0.5 text-[12px] font-bold">{heading}</span>
        <span className="text-[12px]">処理ID：{procId}</span>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className={`${th} w-[9%]`}>有効開始日</td>
            <td className={`${th} w-[9%]`}>納入場所CD</td>
            <td className={`${th} w-[26%]`} colSpan={2}>納入場所</td>
            <td className={`${th} w-[9%]`}>社員番号</td>
            <td className={`${th} w-[23%]`} colSpan={3}>社員名</td>
            <td className="w-[24%]" colSpan={3}></td>
          </tr>
          <tr>
            <td className="px-2 py-1 text-center text-[12px]">{startDate ? formatDate(startDate) : ""}</td>
            <td className="px-2 py-1 text-center font-mono text-[12px]">{locCd ?? ""}</td>
            <td className="px-2 py-1 text-[12px]" colSpan={2}>{locName ?? ""}</td>
            <td className="px-2 py-1 text-center font-mono text-[12px]">{empNo ?? ""}</td>
            <td className="px-2 py-1 text-[12px]" colSpan={3}>{empName ?? ""}</td>
            <td colSpan={3}></td>
          </tr>
          <tr>
            <td className={th}>ロット</td>
            <td className={th}>現行単価</td>
            <td className={th}>購入単価</td>
            <td className={th}>有償支給価格</td>
            <td className={th}>単価</td>
            <td className={th}>支給材建値</td>
            <td className={th}>材料建値</td>
            <td className={th}>単価改定</td>
            <td className={th}>設計変更</td>
            <td className={th}>為替変動</td>
            <td className={th}>その他</td>
          </tr>
          <tr>
            <td className={td}>{lot != null ? lot : ""}</td>
            <td className={td}>{fp(currentPrice)}</td>
            <td className={td}>{fp(newPrice)}</td>
            <td className={td}>{fp(paidSupply ?? 0)}</td>
            <td className={`${td} font-bold`}>{fp(diff)}</td>
            <td className={td}>{fp(bdSupplyMat ?? 0)}</td>
            <td className={td}>{fp(bdMaterial ?? 0)}</td>
            <td className={td}>{fp(bdRevision ?? 0)}</td>
            <td className={td}>{fp(bdDesign ?? 0)}</td>
            <td className={td}>{fp(bdForex ?? 0)}</td>
            <td className={td}>{fp(bdOther ?? 0)}</td>
          </tr>
          <tr>
            <td className={th} colSpan={11}>備考</td>
          </tr>
          <tr>
            <td className="px-2 py-1 text-[12px]" colSpan={11}>{note ?? ""}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Sheet({
  line,
  prev,
  reqNo,
  applicant,
  mgr,
  dept,
  pageNo,
  pageTotal,
}: {
  line: PriceRequestLine;
  prev: PrevInfo;
  reqNo: number | null;
  applicant: { name: string | null; loginId: string | null; date: string | null };
  mgr: { name: string | null; date: string } | null;
  dept: { name: string | null; date: string } | null;
  pageNo: number;
  pageTotal: number;
}) {
  const diff = line.currentPrice != null ? Math.round((line.newPrice - line.currentPrice) * 10000) / 10000 : null;
  const prevLine = prev.line;
  const prevHist = prev.history;
  const prevDiff =
    prevLine && prevLine.currentPrice != null
      ? Math.round((prevLine.newPrice - prevLine.currentPrice) * 10000) / 10000
      : prevHist?.priceBefore != null
        ? Math.round((prevHist.price - prevHist.priceBefore) * 10000) / 10000
        : null;

  return (
    <div className="sheet mx-auto max-w-5xl px-6 pb-8 text-slate-900">
      {/* 承認印 */}
      <div className="mb-1 flex justify-end gap-0">
        <Stamp title="部門長" name={dept?.name} date={dept?.date} />
        <Stamp title="MGR" name={mgr?.name} date={mgr?.date} />
        <Stamp title="担当" name={applicant.name} date={applicant.date} />
      </div>

      {/* タイトル */}
      <div className="mb-3 flex items-end justify-between border-b-4 border-double border-slate-800 pb-1">
        <h1 className="text-2xl font-bold tracking-wide">単価申請内訳</h1>
        <div className="text-right text-[11px] text-slate-600">
          {reqNo != null && <div>申請No: {reqNo}</div>}
          <div>{pageNo}/{pageTotal}</div>
        </div>
      </div>

      {/* ヘッダ（発注先・品目） */}
      <table className="mb-4">
        <tbody>
          <tr>
            <td className="print-keep-bg bg-slate-100 px-3 py-0.5 text-[12px] font-bold">発注先CD</td>
            <td className="px-4 font-mono text-[13px]">{line.supplierCd}</td>
            <td className="px-4 text-[13px]">{line.supplierName ?? ""}</td>
          </tr>
          <tr>
            <td className="print-keep-bg bg-slate-100 px-3 py-0.5 text-[12px] font-bold">品目CD</td>
            <td className="px-4 font-mono text-[13px]">
              {line.itemCd}
              {line.itemBranch ? `-${line.itemBranch}` : ""}
            </td>
            <td className="px-4 text-[13px]">{line.itemName ?? ""}</td>
          </tr>
        </tbody>
      </table>

      {/* 申請内容 */}
      <ContentBlock
        heading="申請内容"
        procId={line.id.replace(/-/g, "").slice(0, 18)}
        startDate={line.startDate}
        locCd={line.locCd}
        locName={line.locName}
        empNo={applicant.loginId}
        empName={applicant.name}
        lot={line.lotQty}
        currentPrice={line.currentPrice}
        newPrice={line.newPrice}
        paidSupply={line.paidSupplyPrice}
        diff={diff}
        bdSupplyMat={line.bdSupplyMat}
        bdMaterial={line.bdMaterial}
        bdRevision={line.bdRevision}
        bdDesign={line.bdDesign}
        bdForex={line.bdForex}
        bdOther={line.bdOther}
        note={line.reasonNote}
      />

      {/* 直近申請内容 */}
      {prevLine || prevHist ? (
        <ContentBlock
          heading="直近申請内容"
          procId={(prevLine?.id ?? prevHist?.id ?? "").replace(/-/g, "").slice(0, 18)}
          startDate={prevLine?.startDate ?? prevHist?.startDate ?? null}
          locCd={prevLine?.locCd ?? prevHist?.locCd ?? null}
          locName={prevLine?.locName ?? null}
          empNo={prev.applicant?.loginId ?? null}
          empName={prev.applicant?.name ?? null}
          lot={prevLine?.lotQty ?? prevHist?.lotQty ?? null}
          currentPrice={prevLine?.currentPrice ?? prevHist?.priceBefore ?? null}
          newPrice={prevLine?.newPrice ?? prevHist?.price ?? null}
          paidSupply={prevLine?.paidSupplyPrice ?? null}
          diff={prevDiff}
          bdSupplyMat={prevLine?.bdSupplyMat ?? null}
          bdMaterial={prevLine?.bdMaterial ?? null}
          bdRevision={prevLine?.bdRevision ?? null}
          bdDesign={prevLine?.bdDesign ?? null}
          bdForex={prevLine?.bdForex ?? null}
          bdOther={prevLine?.bdOther ?? null}
          note={prevLine?.reasonNote ?? prevHist?.reason ?? (prevHist ? "（単価台帳の履歴データ）" : null)}
        />
      ) : (
        <div className="border-t border-dashed border-slate-400 pt-2 text-[12px] text-slate-500">
          直近申請内容：なし（新規登録）
        </div>
      )}
    </div>
  );
}
