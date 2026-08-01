"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, Loader2 } from "lucide-react";

type Kind = "prices" | "items" | "suppliers";

const KIND_INFO: Record<Kind, { label: string; note: string }> = {
  prices: {
    label: "単価申請の一括取込",
    note: "1ファイル＝1申請（下書き）として取り込みます。取込後、内容を確認して提出（承認へ回す）してください。",
  },
  items: {
    label: "品番マスタの一括登録",
    note: "品目CD＋枝番が同じ既存データは上書き（更新）されます。",
  },
  suppliers: {
    label: "取引先マスタの一括登録",
    note: "発注先CDが同じ既存データは上書き（更新）されます。",
  },
};

/** 一括取込フォーム（Excel/CSV）。タブでマスタ取込と単価申請取込を切り替える。 */
export default function ImportForm({ initialTab }: { initialTab?: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(
    initialTab === "items" || initialTab === "suppliers" ? initialTab : "prices"
  );
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function run() {
    if (!file) {
      setError("ファイルを選択してください。");
      return;
    }
    setBusy(true);
    setError("");
    setResult("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await fetch("/api/import-excel", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "取込に失敗しました。");
        return;
      }
      if (kind === "prices" && data.requestId) {
        setResult(`${data.count} 件の明細を取り込みました。申請画面に移動します…`);
        setTimeout(() => router.push(`/requests/${data.requestId}`), 800);
      } else {
        setResult(`${data.count} 件を登録しました。`);
        router.refresh();
      }
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setError(`スキップした行: ${data.errors.slice(0, 5).join(" / ")}${data.errors.length > 5 ? ` 他${data.errors.length - 5}件` : ""}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* タブ */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND_INFO) as Kind[]).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setResult("");
              setError("");
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              kind === k
                ? "bg-[#e11d48] text-white"
                : "border border-[#e5e5e5] bg-white text-[#555555] hover:bg-[#f7f7f5]"
            }`}
          >
            {KIND_INFO[k].label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <p className="mb-4 text-sm text-[#707070]">{KIND_INFO[kind].note}</p>

        <a
          href={`/api/import-excel?template=${kind}`}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#e11d48] hover:underline"
        >
          <Download className="h-4 w-4" />
          取込テンプレート（CSV）をダウンロード
        </a>

        <div className="mb-4">
          <input
            type="file"
            accept=".xlsx,.csv,.tsv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full max-w-md text-sm text-[#555555] file:mr-3 file:rounded-lg file:border-0 file:bg-[#fff1f2] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#e11d48] hover:file:bg-[#dbe8ff]"
          />
          <p className="mt-1 text-xs text-[#a0a0a0]">Excel (.xlsx) または CSV。1行目はヘッダ。最大4MB。</p>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        )}
        {result && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {result}
          </div>
        )}

        <button
          onClick={() => void run()}
          disabled={busy || !file}
          className="inline-flex items-center gap-2 rounded-lg bg-[#e11d48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {busy ? "取込中…" : "取込を実行"}
        </button>
      </div>
    </div>
  );
}
