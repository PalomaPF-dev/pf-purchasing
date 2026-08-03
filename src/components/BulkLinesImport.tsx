"use client";

import { useRef, useState } from "react";
import { AlertCircle, Download, FileSpreadsheet, Info, Loader2 } from "lucide-react";
import type { LineInput } from "@/lib/types";

/**
 * 明細の一括入力（Excel/CSV）。
 * 申請フォームのタブとして使い、解析結果を明細へまとめて反映する（一括申請）。
 * 申請自体は作らず、内容を確認・修正してから提出できる。
 */
export default function BulkLinesImport({
  onApply,
}: {
  onApply: (lines: LineInput[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);

  async function handleFile(file: File) {
    setBusy(true);
    setError("");
    setSkipped([]);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "prices");
      fd.set("parseOnly", "1");
      const res = await fetch("/api/import-excel", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "取込に失敗しました。");
        return;
      }
      const lines = (data.lines ?? []) as LineInput[];
      if (lines.length === 0) {
        setError("取り込める明細がありませんでした。");
        return;
      }
      if (Array.isArray(data.errors) && data.errors.length > 0) setSkipped(data.errors);
      onApply(lines);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
      <div className="mb-3 flex items-start gap-3 rounded-lg border border-[#e11d48]/25 bg-[#fff1f2] p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#e11d48]" />
        <div className="text-sm text-[#9f1239]">
          <p className="font-medium">Excel/CSVで明細をまとめて入力できます</p>
          <p className="mt-0.5 text-xs">
            テンプレートに1行＝1明細で転記してアップロードすると、明細表にまとめて追加されます。
            旧単価は入力不要です（取込時に単価履歴から自動で入ります）。
            追加後は表の上で確認・修正してから提出してください（この操作だけでは申請されません）。
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/import-excel?template=prices"
          className="inline-flex items-center gap-2 rounded-lg border border-[#d5d5d5] bg-white px-4 py-2 text-sm font-medium text-[#555555] hover:bg-[#f7f7f5]"
        >
          <Download className="h-4 w-4" />
          テンプレート（CSV）をダウンロード
        </a>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          {busy ? "取込中…" : "Excel/CSVを選択"}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.tsv,.txt"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
        <span className="text-xs text-[#a0a0a0]">Excel (.xlsx) または CSV・1行目はヘッダ・最大4MB</span>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {skipped.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            スキップした行があります
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {skipped.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {skipped.length > 8 && <li>他 {skipped.length - 8} 件</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
