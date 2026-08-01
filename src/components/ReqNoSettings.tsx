"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Hash, Loader2, Save } from "lucide-react";
import { saveReqNoSettingsAction } from "@/lib/actions";

const PRESETS = [
  { label: "2026-0001", format: "{YYYY}-{SEQ4}" },
  { label: "202608-0001", format: "{YYYY}{MM}-{SEQ4}" },
  { label: "PU-2026-0001", format: "PU-{YYYY}-{SEQ4}" },
  { label: "0001", format: "{SEQ4}" },
];

/**
 * 申請番号の採番ルール（管理者）。
 * 書式と連番のリセット単位を決める。既に採番済みの申請の番号は変わらない。
 */
export default function ReqNoSettings({
  format,
  reset,
}: {
  format: string;
  reset: "none" | "year" | "month";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(format);
  const [r, setR] = useState(reset);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // 保存前でも結果が分かるように、入力中の書式でプレビューする
  const now = new Date();
  const preview = (f || "{YYYY}-{SEQ4}")
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{YY\}/g, String(now.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, "0"))
    .replace(/\{SEQ(\d*)\}/g, (_, d: string) => (d ? "1".padStart(Number(d), "0") : "1"));

  function save() {
    setBusy(true);
    setSaved(false);
    setError("");
    saveReqNoSettingsAction(f, r)
      .then((res) => {
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setSaved(true);
        router.refresh();
      })
      .finally(() => setBusy(false));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm text-[#555555] hover:bg-[#f7f7f5]"
      >
        <Hash className="h-4 w-4" />
        申請番号のルール
      </button>
    );
  }

  const input =
    "w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#e11d48] focus:outline-none";

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
      <h2 className="mb-1 text-sm font-bold text-[#333333]">申請番号のルール</h2>
      <p className="mb-3 text-xs text-[#707070]">
        提出時に採番される申請番号の書式です。使えるのは
        <span className="font-mono"> {"{YYYY}"} </span>（西暦4桁）
        <span className="font-mono"> {"{YY}"} </span>（下2桁）
        <span className="font-mono"> {"{MM}"} </span>（月2桁）
        <span className="font-mono"> {"{SEQ}"} </span>（連番。
        <span className="font-mono">{"{SEQ4}"}</span> のように書くとゼロ埋めの桁数を指定できます）。
        既に採番済みの申請の番号は変わりません。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[#333333]">書式</label>
          <input className={`${input} font-mono`} value={f} onChange={(e) => setF(e.target.value)} />
          <div className="mt-1 text-xs text-[#707070]">
            例: <span className="font-mono font-medium text-[#333333]">{preview}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.format}
                type="button"
                onClick={() => setF(p.format)}
                className="rounded-full border border-[#e5e5e5] px-2 py-0.5 text-xs text-[#555555] hover:bg-[#f7f7f5]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#333333]">連番のリセット</label>
          <select className={input} value={r} onChange={(e) => setR(e.target.value as typeof r)}>
            <option value="year">年ごとに 1 に戻す</option>
            <option value="month">月ごとに 1 に戻す</option>
            <option value="none">リセットしない（通し番号）</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          保存しました。次に提出される申請から適用されます。
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-[#e11d48] px-5 py-2 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[#d5d5d5] bg-white px-4 py-2 text-sm text-[#555555] hover:bg-[#f7f7f5]"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
