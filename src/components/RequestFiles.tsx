"use client";

import { useState } from "react";
import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";

export interface RequestFileView {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: string;
  uploadedName: string | null;
  createdAt: string;
}

function sizeLabel(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/**
 * 申請の添付資料（見積書・仕様書など）。
 * 提出後は閲覧のみ（記録として残す）。承認後も単価履歴から同じファイルを開ける。
 */
export default function RequestFiles({
  requestId,
  initialFiles,
  editable,
}: {
  requestId: string;
  initialFiles: RequestFileView[];
  editable: boolean;
}) {
  const [files, setFiles] = useState<RequestFileView[]>(initialFiles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("requestId", requestId);
      for (const f of Array.from(list)) fd.append("file", f);
      const res = await fetch("/api/request-files", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "添付に失敗しました。");
        return;
      }
      setFiles(data.files ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`添付「${name}」を削除しますか？`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/request-files?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "削除に失敗しました。");
        return;
      }
      setFiles(data.files ?? []);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-[#333333]">
        <Paperclip className="h-4 w-4 text-[#707070]" />
        添付資料
        <span className="font-normal text-[#a0a0a0]">（見積書・仕様書など）</span>
      </h2>

      {files.length === 0 ? (
        <p className="mb-3 text-sm text-[#a0a0a0]">添付はありません。</p>
      ) : (
        <ul className="mb-3 divide-y divide-[#f5f5f5]">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-[#707070]" />
              <a
                href={`/api/request-files/${f.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-medium text-[#e11d48] hover:underline"
              >
                {f.fileName}
              </a>
              <span className="shrink-0 text-xs text-[#a0a0a0]">
                {sizeLabel(f.sizeBytes)}
                {f.uploadedName && ` / ${f.uploadedName}`}
              </span>
              {editable && (
                <button
                  onClick={() => void remove(f.id, f.fileName)}
                  disabled={busy}
                  className="ml-auto shrink-0 rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                  title="削除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      )}

      {editable && (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#e11d48] px-4 py-2 text-sm font-semibold text-[#e11d48] hover:bg-[#fff1f2]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "アップロード中…" : "ファイルを添付"}
          <input
            type="file"
            multiple
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>
      )}
      {editable && (
        <p className="mt-2 text-xs text-[#a0a0a0]">
          PDF・画像・Excel など。1ファイル4MBまで。提出後は削除できません。削除しても記録と実体は残ります（電帳法対応。承認後は単価履歴からも閲覧できます）。
        </p>
      )}
    </section>
  );
}
