"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { saveWfSettingsAction } from "@/lib/actions";
import type { WfSettings } from "@/lib/db";

/**
 * 承認ワークフロー設定（管理者）。
 * 承認段階数・各段階の承認者・段階名称を変更できる。
 * 承認者を空にすると、その段階は全管理者が承認できる（既定の運用）。
 */
export default function WfSettingsForm({ initial }: { initial: WfSettings }) {
  const router = useRouter();
  const [stages, setStages] = useState<1 | 2>(initial.stages);
  const [mgrLabel, setMgrLabel] = useState(initial.mgrLabel);
  const [deptLabel, setDeptLabel] = useState(initial.deptLabel);
  const [mgrApprovers, setMgrApprovers] = useState(initial.mgrApprovers.join(", "));
  const [deptApprovers, setDeptApprovers] = useState(initial.deptApprovers.join(", "));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function save() {
    setBusy(true);
    setSaved(false);
    setError("");
    saveWfSettingsAction({ stages, mgrApprovers, deptApprovers, mgrLabel, deptLabel })
      .then(() => {
        setSaved(true);
        router.refresh();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "保存に失敗しました"))
      .finally(() => setBusy(false));
  }

  const input =
    "w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#e11d48] focus:outline-none focus:ring-1 focus:ring-[#e11d48]";
  const label = "mb-1 block text-sm font-medium text-[#333333]";

  return (
    <div className="space-y-4">
      {/* 承認段階 */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="mb-3 text-sm font-bold text-[#333333]">承認段階</h2>
        <div className="space-y-2">
          {(
            [
              [2, `2段階（${mgrLabel || "MGR"}承認 → ${deptLabel || "部門長"}承認）`, "現行の運用。部門長承認で単価履歴に反映されます。"],
              [1, `1段階（${mgrLabel || "MGR"}承認のみ）`, "承認が1回で完了し、そのまま単価履歴に反映されます。"],
            ] as const
          ).map(([v, title, note]) => (
            <label
              key={v}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                stages === v ? "border-[#e11d48] bg-[#fff1f2]" : "border-[#e5e5e5] hover:bg-[#f7f7f5]"
              }`}
            >
              <input
                type="radio"
                name="stages"
                checked={stages === v}
                onChange={() => setStages(v)}
                className="mt-0.5 h-4 w-4 accent-[#e11d48]"
              />
              <span>
                <span className="block text-sm font-medium text-[#333333]">{title}</span>
                <span className="block text-xs text-[#707070]">{note}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* 段階名称 */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-[#333333]">承認段階の名称</h2>
        <p className="mb-3 text-xs text-[#707070]">
          画面と申請書（登録品単価連絡書）の承認欄に表示されます。
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>1段階目の名称</label>
            <input className={input} value={mgrLabel} onChange={(e) => setMgrLabel(e.target.value)} placeholder="MGR" />
          </div>
          <div>
            <label className={label}>2段階目の名称</label>
            <input
              className={input}
              value={deptLabel}
              onChange={(e) => setDeptLabel(e.target.value)}
              placeholder="部門長"
              disabled={stages === 1}
            />
          </div>
        </div>
      </section>

      {/* 承認者 */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-[#333333]">承認者の指定</h2>
        <p className="mb-3 text-xs text-[#707070]">
          社員番号をカンマ区切りで入力します（例: 12345, 67890）。
          <span className="font-medium">空欄にすると、その段階はすべての管理者が承認できます。</span>
          指定した場合、その社員番号の管理者だけが承認・差し戻しできます。
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>{mgrLabel || "MGR"}承認の承認者</label>
            <input
              className={`${input} font-mono`}
              value={mgrApprovers}
              onChange={(e) => setMgrApprovers(e.target.value)}
              placeholder="空欄＝全管理者"
            />
          </div>
          <div>
            <label className={label}>{deptLabel || "部門長"}承認の承認者</label>
            <input
              className={`${input} font-mono`}
              value={deptApprovers}
              onChange={(e) => setDeptApprovers(e.target.value)}
              placeholder="空欄＝全管理者"
              disabled={stages === 1}
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          設定を保存しました。以後の承認から適用されます。
        </div>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-[#e11d48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        設定を保存
      </button>
    </div>
  );
}
