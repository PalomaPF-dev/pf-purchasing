"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Hash, Loader2, RefreshCw, Save } from "lucide-react";
import { renumberRequestsAction, saveReqNoSettingsAction } from "@/lib/actions";

const PRESETS = [
  { label: "2026-0001", format: "{YYYY}-{SEQ4}" },
  { label: "202608-0001", format: "{YYYY}{MM}-{SEQ4}" },
  { label: "PU-2026-0001", format: "PU-{YYYY}-{SEQ4}" },
  { label: "0001", format: "{SEQ4}" },
];

/**
 * 申請番号の採番ルール（管理者）。
 * 書式と連番のリセット単位を決める。以後の提出分に適用され、
 * 既存の申請番号は「振り直す」を実行したときだけ現在のルールに置き換わる。
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
  // 既存の申請番号の振り直し（先に確認 → 実行）
  const [renumbering, setRenumbering] = useState(false);
  const [plan, setPlan] = useState<{
    total: number;
    changed: number;
    samples: { before: string; after: string }[];
  } | null>(null);
  const [renumbered, setRenumbered] = useState("");

  function renumber(dryRun: boolean) {
    setRenumbering(true);
    setError("");
    setRenumbered("");
    renumberRequestsAction(dryRun)
      .then((res) => {
        if (!res.ok) {
          setError(res.message);
          return;
        }
        if (dryRun) {
          setPlan(res.data);
        } else {
          setPlan(null);
          setRenumbered(`${res.data.changed.toLocaleString()} 件の申請番号を振り直しました。`);
          router.refresh();
        }
      })
      .finally(() => setRenumbering(false));
  }

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
        保存すると以後の提出分に適用されます。既存の申請番号もそろえたい場合は、下の「既存の申請番号を振り直す」を実行してください。
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

      {/* 既存の申請番号の振り直し（保存したルールを過去分にも適用する） */}
      <div className="mt-4 rounded-lg border border-[#eeeeee] bg-[#fafafa] p-3">
        <div className="text-sm font-medium text-[#333333]">既存の申請番号を振り直す</div>
        <p className="mt-1 text-xs text-[#707070]">
          提出済みのすべての申請に、保存済みのルールで番号を付け直します。提出日時の古い順に連番を振り、
          リセット単位ごとに 1 から数え直します。※ 先に書式を保存してから実行してください。
        </p>
        {plan && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            対象 {plan.total.toLocaleString()} 件のうち{" "}
            <span className="font-bold">{plan.changed.toLocaleString()} 件</span> の番号が変わります。
            {plan.samples.length > 0 && (
              <ul className="mt-1 space-y-0.5 font-mono">
                {plan.samples.map((s, i) => (
                  <li key={i}>
                    {s.before} → <span className="font-bold">{s.after}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {renumbered && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />
            {renumbered}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => renumber(true)}
            disabled={renumbering}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-xs font-medium text-[#555555] hover:bg-[#f7f7f5] disabled:opacity-50"
          >
            {renumbering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            変更内容を確認
          </button>
          {plan && plan.changed > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!confirm(`${plan.changed} 件の申請番号を振り直します。よろしいですか？`)) return;
                renumber(false);
              }}
              disabled={renumbering}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#e11d48] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
            >
              振り直しを実行
            </button>
          )}
        </div>
      </div>

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
