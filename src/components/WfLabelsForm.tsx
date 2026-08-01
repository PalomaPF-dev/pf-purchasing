"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { saveWfLabelsAction } from "@/lib/actions";

/**
 * 承認段階の名称（既定は MGR / 部門長）の変更。
 * 承認W/Fはユーザー登録で完結させるため、この画面にインラインで置く。
 */
export default function WfLabelsForm({
  mgrLabel,
  deptLabel,
}: {
  mgrLabel: string;
  deptLabel: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [mgr, setMgr] = useState(mgrLabel);
  const [dept, setDept] = useState(deptLabel);
  const [busy, setBusy] = useState(false);

  function save() {
    setBusy(true);
    saveWfLabelsAction(mgr, dept)
      .then(() => {
        setEditing(false);
        router.refresh();
      })
      .catch((e) => alert(e instanceof Error ? e.message : "保存に失敗しました"))
      .finally(() => setBusy(false));
  }

  function cancel() {
    setMgr(mgrLabel);
    setDept(deptLabel);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-[#707070] hover:bg-[#f7f7f5]"
        title="承認段階の名称を変更"
      >
        段階の名称を変更
        <Pencil className="h-3 w-3 text-[#c0c0c0]" />
      </button>
    );
  }

  const cell = "w-28 rounded border border-[#d5d5d5] px-2 py-1 text-sm focus:border-[#e11d48] focus:outline-none";
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[#707070]">
      1段階目
      <input autoFocus value={mgr} onChange={(e) => setMgr(e.target.value)} onKeyDown={onKey} placeholder="MGR" className={cell} />
      2段階目
      <input value={dept} onChange={(e) => setDept(e.target.value)} onKeyDown={onKey} placeholder="部門長" className={cell} />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
        title="保存"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={cancel} className="rounded p-1 hover:bg-[#f7f7f5]" title="キャンセル">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
