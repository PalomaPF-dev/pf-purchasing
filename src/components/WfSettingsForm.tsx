"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { saveWfSettingsAction } from "@/lib/actions";
import type { WfSettings } from "@/lib/db";

export interface ApproverInfo {
  loginId: string;
  name: string;
}

/**
 * 承認ワークフロー設定（管理者）。
 * 承認は「MGR承認 → 部門長承認」の2段階固定。
 * 承認者は社員マスタ（ユーザー登録）の「承認W/F」で指定するため、ここでは名称のみ設定する。
 */
export default function WfSettingsForm({
  initial,
  mgrApprovers,
  deptApprovers,
}: {
  initial: WfSettings;
  mgrApprovers: ApproverInfo[];
  deptApprovers: ApproverInfo[];
}) {
  const router = useRouter();
  const [mgrLabel, setMgrLabel] = useState(initial.mgrLabel);
  const [deptLabel, setDeptLabel] = useState(initial.deptLabel);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function save() {
    setBusy(true);
    setSaved(false);
    setError("");
    // 承認者は社員マスタ側で管理するため、ここでは現在の指定をそのまま維持する
    saveWfSettingsAction({
      stages: 2,
      mgrApprovers: initial.mgrApprovers.join(", "),
      deptApprovers: initial.deptApprovers.join(", "),
      mgrLabel,
      deptLabel,
    })
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
      {/* 承認段階（2段階固定） */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-[#333333]">承認段階</h2>
        <p className="text-sm text-[#555555]">
          すべての単価申請は <span className="font-medium">{mgrLabel || "MGR"}承認 → {deptLabel || "部門長"}承認</span> の2段階です。
          {deptLabel || "部門長"}承認が完了すると単価履歴に反映されます。
        </p>
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
            />
          </div>
        </div>
      </section>

      {/* 承認者（社員マスタで指定） */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="mb-1 text-sm font-bold text-[#333333]">承認者</h2>
        <p className="mb-3 text-xs text-[#707070]">
          承認者は「設定 → ユーザー登録」の各社員の<span className="font-medium">「承認W/F」</span>で指定します。
          変更したら「社員マスタからユーザーを登録 / 更新」を押すと、この一覧に反映されます。
          どちらも未指定の場合は、すべての管理者が承認できます。
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ApproverList title={`${mgrLabel || "MGR"}承認`} list={mgrApprovers} />
          <ApproverList title={`${deptLabel || "部門長"}承認`} list={deptApprovers} />
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

function ApproverList({ title, list }: { title: string; list: ApproverInfo[] }) {
  return (
    <div className="rounded-lg border border-[#e5e5e5] p-3">
      <div className="mb-1.5 text-sm font-medium text-[#333333]">{title}</div>
      {list.length === 0 ? (
        <div className="text-xs text-[#a0a0a0]">未指定（すべての管理者が承認できます）</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {list.map((a) => (
            <li key={a.loginId}>
              {a.name || "（氏名未登録）"}
              <span className="ml-1 font-mono text-xs text-[#909090]">（{a.loginId}）</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
