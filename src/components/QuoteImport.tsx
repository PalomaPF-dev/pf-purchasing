"use client";

import { useRef, useState } from "react";
import { AlertCircle, FileSpreadsheet, Info, Loader2, Sparkles } from "lucide-react";

/**
 * 見積書のAI取り込み（PF品質管理・PF設備管理と同仕様）。
 * - Excel（.xlsx/.xlsm）・PDF・画像に対応。複数ファイルをまとめて解析（ドラッグ&ドロップ可）
 * - 解析できなかったファイルは理由つきで一覧表示
 * - 読み取り結果はプレビューで確認・取捨選択してから明細へ反映
 */

export interface QuoteItemDraft {
  itemCd: string | null;
  itemName: string | null;
  unitPrice: number;
  unit: string | null;
  lotQty: number | null;
  notes: string | null;
  /** プレビューで取り込み対象から外せる */
  include: boolean;
}

export interface QuoteDraft {
  fileName: string;
  supplierCd: string | null;
  supplierName: string | null;
  effectiveDate: string | null;
  currency: string | null;
  items: QuoteItemDraft[];
}

/** 反映時に親（申請フォーム）へ渡す明細 */
export interface QuoteAppliedLine {
  itemCd: string;
  itemName: string;
  supplierCd: string;
  supplierName: string;
  unitCd: string;
  lotQty: string;
  currency: string;
  startDate: string;
  newPrice: string;
  reasonNote: string;
}

const ACCEPT =
  ".xlsx,.xlsm,.pdf,application/pdf,image/png,image/jpeg,image/webp," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-excel.sheet.macroEnabled.12";

const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "");

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:.*?;base64,/, ""));
    r.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    r.readAsDataURL(file);
  });

export default function QuoteImport({
  today,
  onApply,
}: {
  today: string;
  onApply: (lines: QuoteAppliedLine[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<QuoteDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [parseErrors, setParseErrors] = useState<{ file: string; reason: string }[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    setParseErrors([]);
    setUploading(true);
    const list = [...files];
    const acc: QuoteDraft[] = [...drafts];
    const failed: { file: string; reason: string }[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const ext = extOf(file.name);
        setProgress(`AIが読み取り中… (${i + 1}/${list.length}) ${file.name}`);
        if (ext === "xls") {
          failed.push({
            file: file.name,
            reason: "旧形式(.xls)は未対応です。Excelで .xlsx に保存し直してください",
          });
          continue;
        }
        const isExcel = ext === "xlsx" || ext === "xlsm";
        try {
          const base64 = await fileToBase64(file);
          const res = await fetch("/api/import-quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              isExcel
                ? { xlsxBase64: base64, fileName: file.name }
                : {
                    fileBase64: base64,
                    contentType: file.type || "application/pdf",
                    fileName: file.name,
                  }
            ),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            failed.push({ file: file.name, reason: data.error || "読み取りに失敗しました" });
            continue;
          }
          const q = data.quote as Omit<QuoteDraft, "fileName" | "items"> & {
            items: Omit<QuoteItemDraft, "include">[];
          };
          acc.push({
            fileName: file.name,
            supplierCd: q.supplierCd,
            supplierName: q.supplierName,
            effectiveDate: q.effectiveDate,
            currency: q.currency,
            items: (q.items ?? []).map((it) => ({ ...it, include: true })),
          });
        } catch (e) {
          failed.push({
            file: file.name,
            reason: e instanceof Error ? e.message : "読み取りに失敗しました",
          });
        }
      }
      setDrafts(acc);
      setParseErrors(failed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み取りに失敗しました");
    } finally {
      setUploading(false);
      setProgress("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function updateDraft(di: number, patch: Partial<QuoteDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === di ? { ...d, ...patch } : d)));
  }

  function updateItem(di: number, ii: number, patch: Partial<QuoteItemDraft>) {
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === di ? { ...d, items: d.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : d
      )
    );
  }

  const selectedCount = drafts.reduce((n, d) => n + d.items.filter((i) => i.include).length, 0);

  function apply() {
    const lines: QuoteAppliedLine[] = [];
    for (const d of drafts) {
      for (const it of d.items) {
        if (!it.include) continue;
        lines.push({
          itemCd: it.itemCd ?? "",
          itemName: it.itemName ?? "",
          supplierCd: d.supplierCd ?? "",
          supplierName: d.supplierName ?? "",
          unitCd: it.unit ?? "",
          lotQty: it.lotQty != null ? String(it.lotQty) : "",
          currency: d.currency ?? "JPY",
          startDate: d.effectiveDate ?? today,
          newPrice: String(it.unitPrice),
          reasonNote: it.notes ?? "",
        });
      }
    }
    onApply(lines);
    setDrafts([]);
    setParseErrors([]);
  }

  const inputCls =
    "w-full rounded border border-[#d5d5d5] bg-white px-2 py-1 text-xs focus:border-[#e11d48] focus:outline-none";

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
      {/* 説明 */}
      <div className="mb-3 flex items-start gap-3 rounded-lg border border-[#e11d48]/25 bg-[#fff1f2] p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#e11d48]" />
        <div className="text-sm text-[#9f1239]">
          <p className="font-medium">見積書をそのまま取り込めます</p>
          <p className="mt-0.5 text-xs">
            Excel（.xlsx / .xlsm）・PDF（スキャン画像も可）・画像に対応。複数ファイル・複数シートを
            まとめて解析し、品番・見積単価・ロット数などを自動で読み取ります。
          </p>
          <p className="mt-0.5 text-xs">
            読み取り結果はプレビューで確認・修正してから明細に反映できます。
          </p>
        </div>
      </div>

      {/* アップロードエリア（ドロップ / クリック） */}
      <div
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white text-center hover:border-[#e11d48] hover:bg-[#fff1f2] ${
          drafts.length > 0 ? "py-5" : "py-10"
        }`}
      >
        <FileSpreadsheet
          className={`text-slate-300 ${drafts.length > 0 ? "h-6 w-6" : "h-9 w-9"}`}
        />
        <div>
          <p className="font-medium text-slate-600">
            {uploading ? "解析中…" : "見積書ファイルをドロップ（複数可）"}
          </p>
          <p className="text-sm text-slate-400">
            またはクリックしてファイルを選択（.xlsx / .xlsm / .pdf / 画像）
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          disabled={uploading}
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {uploading && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#e11d48]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {progress || "読み取り中…"}
        </p>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {parseErrors.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            一部のファイルを解析できませんでした
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {parseErrors.map((e, i) => (
              <li key={i}>
                {e.file}: {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* プレビュー */}
      {drafts.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700">
              読み取り結果のプレビュー（{drafts.length} ファイル / 明細 {selectedCount} 件）— 内容を確認・修正してください
            </h3>
            <button
              type="button"
              onClick={() => {
                setDrafts([]);
                setParseErrors([]);
              }}
              className="ml-auto text-xs text-slate-500 hover:underline"
            >
              クリア
            </button>
          </div>

          <div className="space-y-4">
            {drafts.map((d, di) => (
              <div key={`${d.fileName}-${di}`} className="rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-[#e11d48]" />
                  <span className="font-medium text-slate-700">{d.fileName}</span>
                  <span className="ml-auto text-slate-500">品目 {d.items.length} 件</span>
                </div>
                {/* 取引先・適用開始日（見積書共通の項目） */}
                <div className="grid grid-cols-2 gap-2 border-b border-slate-100 px-3 py-2 sm:grid-cols-4">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-slate-500">取引先CD</label>
                    <input
                      className={`${inputCls} font-mono`}
                      value={d.supplierCd ?? ""}
                      onChange={(e) => updateDraft(di, { supplierCd: e.target.value })}
                      placeholder="00906"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-0.5 block text-[10px] text-slate-500">取引先名</label>
                    <input
                      className={inputCls}
                      value={d.supplierName ?? ""}
                      onChange={(e) => updateDraft(di, { supplierName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-slate-500">適用開始日</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={d.effectiveDate ?? today}
                      onChange={(e) => updateDraft(di, { effectiveDate: e.target.value })}
                    />
                  </div>
                </div>
                {/* 品目行 */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-xs">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="px-3 py-1.5 font-medium">取込</th>
                        <th className="px-2 py-1.5 font-medium">品番</th>
                        <th className="px-2 py-1.5 font-medium">品名</th>
                        <th className="px-2 py-1.5 text-right font-medium">見積単価</th>
                        <th className="px-2 py-1.5 font-medium">単位</th>
                        <th className="px-2 py-1.5 text-right font-medium">ロット</th>
                        <th className="px-2 py-1.5 font-medium">備考</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {d.items.map((it, ii) => (
                        <tr key={ii} className={it.include ? "" : "opacity-40"}>
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={it.include}
                              onChange={(e) => updateItem(di, ii, { include: e.target.checked })}
                              className="h-4 w-4 accent-[#e11d48]"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`${inputCls} font-mono`}
                              value={it.itemCd ?? ""}
                              onChange={(e) => updateItem(di, ii, { itemCd: e.target.value })}
                              placeholder="（未読取）"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputCls}
                              value={it.itemName ?? ""}
                              onChange={(e) => updateItem(di, ii, { itemName: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`${inputCls} text-right font-mono font-bold`}
                              inputMode="decimal"
                              value={String(it.unitPrice)}
                              onChange={(e) =>
                                updateItem(di, ii, { unitPrice: Number(e.target.value) || 0 })
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputCls}
                              value={it.unit ?? ""}
                              onChange={(e) => updateItem(di, ii, { unit: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={`${inputCls} text-right font-mono`}
                              inputMode="decimal"
                              value={it.lotQty != null ? String(it.lotQty) : ""}
                              onChange={(e) =>
                                updateItem(di, ii, {
                                  lotQty: e.target.value === "" ? null : Number(e.target.value),
                                })
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputCls}
                              value={it.notes ?? ""}
                              onChange={(e) => updateItem(di, ii, { notes: e.target.value })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={apply}
              disabled={selectedCount === 0}
              className="rounded-lg bg-[#e11d48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
            >
              選択した {selectedCount} 件を申請明細に反映
            </button>
            <span className="text-xs text-slate-500">
              反映後も申請フォームで自由に編集できます（現行単価の取得もそこで行えます）。
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
