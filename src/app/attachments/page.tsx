import Link from "next/link";
import { Download, FileArchive, Paperclip, Search } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listPurgedFiles, searchAttachments } from "@/lib/db";
import { REQUEST_STATUS_LABEL } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

function sizeText(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/**
 * 添付資料の検索（管理者・電帳法対応）。
 * 電子取引データ（見積書など）を、取引先・取引年月日（適用日）・取引金額で
 * 横断検索できる。索引簿CSVとZIP一括ダウンロードで税務調査の
 * 「ダウンロードの求め」にも応じられる。削除済み（論理削除）も確認できる。
 */
export default async function AttachmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    supplierQ?: string;
    amount?: string;
    from?: string;
    to?: string;
    deleted?: string;
    page?: string;
  }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const supplierQ = sp.supplierQ ?? "";
  const amountStr = sp.amount ?? "";
  const amount = amountStr.trim() !== "" ? Number(amountStr.replace(/,/g, "")) : null;
  const ymd = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const from = ymd(sp.from);
  const to = ymd(sp.to);
  const includeDeleted = sp.deleted === "1";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [{ rows, total }, purged] = await Promise.all([
    searchAttachments(session.companyId, {
      q: q || null,
      supplierQ: supplierQ || null,
      amount: amount != null && Number.isFinite(amount) ? amount : null,
      from: from || null,
      to: to || null,
      includeDeleted,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    includeDeleted ? listPurgedFiles(session.companyId, { limit: 100 }) : Promise.resolve([]),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged: Record<string, string> = {
      q,
      supplierQ,
      amount: amountStr,
      from,
      to,
      deleted: includeDeleted ? "1" : "",
      page: "",
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  const input =
    "w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none";

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="添付資料の検索"
        description={`申請に添付された見積書・仕様書などの電子取引データを横断検索します（全 ${total.toLocaleString()} 件）。取引先・取引年月日（適用日）・取引金額で探せます（電帳法対応）。`}
      />

      {/* 電帳法の3要件（取引先・取引年月日・取引金額）で絞り込む */}
      <form action="/attachments" method="GET" className="mb-4 rounded-xl border border-[#e5e5e5] bg-white p-4">
        <div className="grid gap-2 sm:grid-cols-5">
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">
              ファイル名・申請No・タイトル
            </label>
            <input name="q" defaultValue={q} placeholder="例: 見積" className={input} />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">取引先（CD・名称）</label>
            <input name="supplierQ" defaultValue={supplierQ} placeholder="例: 岡谷" className={input} />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">取引金額（明細の新単価）</label>
            <input name="amount" defaultValue={amountStr} inputMode="decimal" placeholder="例: 2448" className={`${input} font-mono`} />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">取引年月日（自）</label>
            <input type="date" name="from" defaultValue={from} className={input} />
          </div>
          <div>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">取引年月日（至）</label>
            <input type="date" name="to" defaultValue={to} className={input} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#e11d48] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#be123c]"
          >
            <Search className="h-4 w-4" />
            この条件で検索
          </button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-[#555555]">
            <input
              type="checkbox"
              name="deleted"
              value="1"
              defaultChecked={includeDeleted}
              className="h-4 w-4 accent-[#e11d48]"
            />
            削除済みも表示（訂正・削除の履歴）
          </label>
          <span className="text-xs text-[#a0a0a0]">
            取引年月日は申請明細の適用日で照合します。添付は論理削除のため、削除しても記録と実体が残ります。
          </span>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a
          href={`/api/export/attachments${qs({ page: "" })}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-medium text-[#555555] hover:bg-[#f7f7f5]"
        >
          <Download className="h-3.5 w-3.5" />
          索引簿CSV（この条件の全件）
        </a>
        <a
          href={`/api/export/attachments${qs({ page: "", format: "zip" })}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-medium text-[#555555] hover:bg-[#f7f7f5]"
          title="この条件のファイル本体をまとめてダウンロードします（税務調査のダウンロードの求め対応・200件まで）"
        >
          <FileArchive className="h-3.5 w-3.5" />
          一括ダウンロード（ZIP）
        </a>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#707070]">
          該当する添付資料がありません。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="whitespace-nowrap border-b border-[#eeeeee] text-left text-xs text-[#707070]">
                <th className="px-4 py-2.5 font-medium">ファイル名</th>
                <th className="px-2 py-2.5 font-medium">申請No / タイトル</th>
                <th className="px-2 py-2.5 font-medium">取引先</th>
                <th className="px-2 py-2.5 font-medium">取引年月日（適用日）</th>
                <th className="px-2 py-2.5 text-right font-medium">サイズ</th>
                <th className="px-2 py-2.5 font-medium">登録</th>
                <th className="px-2 py-2.5 font-medium">状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className={`border-b border-[#f5f5f5] ${f.deletedAt ? "bg-red-50/40" : "hover:bg-[#f7f7f5]"}`}>
                  <td className="max-w-72 px-4 py-2">
                    <a
                      href={`/api/request-files/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 text-[#e11d48] hover:underline"
                      title={f.fileName}
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{f.fileName}</span>
                    </a>
                  </td>
                  <td className="max-w-64 px-2 py-2">
                    <Link href={`/requests/${f.requestId}`} className="hover:underline">
                      <span className="font-mono font-medium">{f.reqCode ?? "（下書き）"}</span>
                      {f.requestTitle && <span className="ml-1.5 text-xs text-[#707070]">{f.requestTitle}</span>}
                    </Link>
                  </td>
                  <td className="max-w-52 truncate px-2 py-2 text-xs" title={f.supplierSummary ?? undefined}>
                    {f.supplierSummary ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs">
                    {f.minStartDate
                      ? f.minStartDate === f.maxStartDate
                        ? f.minStartDate.replace(/-/g, "/")
                        : `${f.minStartDate.replace(/-/g, "/")}〜${(f.maxStartDate ?? "").replace(/-/g, "/")}`
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-xs">{sizeText(f.sizeBytes)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs">
                    {f.uploadedName ?? "—"}
                    <span className="ml-1 text-[#a0a0a0]">{formatDateTime(f.createdAt)}</span>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {f.deletedAt ? (
                      <span
                        className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700"
                        title={`${f.deletedName ?? ""} ${formatDateTime(f.deletedAt)}${f.deleteReason ? ` 理由: ${f.deleteReason}` : ""}`}
                      >
                        削除済み
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        {REQUEST_STATUS_LABEL[f.requestStatus]}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={`/attachments${qs({ page: String(page - 1) })}`} className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]">
              ← 前へ
            </Link>
          )}
          <span className="text-[#707070]">{page} / {pages} ページ</span>
          {page < pages && (
            <Link href={`/attachments${qs({ page: String(page + 1) })}`} className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]">
              次へ →
            </Link>
          )}
        </div>
      )}

      {/* 申請ごと削除された下書きの添付（監査ログ）。実体は保持している */}
      {includeDeleted && purged.length > 0 && (
        <section className="mt-6 rounded-xl border border-[#e5e5e5] bg-white">
          <div className="border-b border-[#eeeeee] px-4 py-3 text-sm font-bold text-[#333333]">
            申請（下書き）ごと削除された添付の記録
            <span className="ml-2 text-xs font-normal text-[#a0a0a0]">
              実体は保持しており、ファイル名からダウンロードできます
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-[#eeeeee] text-left text-xs text-[#707070]">
                  <th className="px-4 py-2 font-medium">ファイル名</th>
                  <th className="px-2 py-2 font-medium">申請No</th>
                  <th className="px-2 py-2 text-right font-medium">サイズ</th>
                  <th className="px-2 py-2 font-medium">登録</th>
                  <th className="px-2 py-2 font-medium">削除</th>
                </tr>
              </thead>
              <tbody>
                {purged.map((f) => (
                  <tr key={f.id} className="border-b border-[#f5f5f5]">
                    <td className="max-w-72 px-4 py-2">
                      {f.blobUrl ? (
                        <a
                          href={`/api/request-files/audit/${f.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1 text-[#e11d48] hover:underline"
                          title={f.fileName}
                        >
                          <Paperclip className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{f.fileName}</span>
                        </a>
                      ) : (
                        <span className="truncate">{f.fileName}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{f.reqCode ?? "（下書き）"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-xs">{sizeText(f.sizeBytes)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs">
                      {f.uploadedName ?? "—"}
                      {f.uploadedAt && <span className="ml-1 text-[#a0a0a0]">{formatDateTime(f.uploadedAt)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs">
                      {f.actorName ?? "—"}
                      <span className="ml-1 text-[#a0a0a0]">{formatDateTime(f.createdAt)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
