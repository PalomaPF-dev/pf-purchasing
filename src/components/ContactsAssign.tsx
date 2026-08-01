"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { setSupplierContactsAction } from "@/lib/actions";

/**
 * 取引先1件の担当窓口の割当。
 * - 企画グループ（バイヤー）: 主担当・副担当
 * - 管理グループ（チェイサー）
 * ここに設定された社員番号の人だけが、その発注先を閲覧・申請できる（管理者は全件）。
 */
export default function ContactsAssign({
  supplierId,
  supplierLabel,
  buyerLoginId,
  buyerSubLoginId,
  chaserLoginId,
}: {
  supplierId: string;
  supplierLabel: string;
  buyerLoginId: string | null;
  buyerSubLoginId: string | null;
  chaserLoginId: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [buyer, setBuyer] = useState(buyerLoginId ?? "");
  const [sub, setSub] = useState(buyerSubLoginId ?? "");
  const [chaser, setChaser] = useState(chaserLoginId ?? "");
  const [busy, setBusy] = useState(false);

  function save() {
    setBusy(true);
    setSupplierContactsAction(supplierId, {
      buyerLoginId: buyer,
      buyerSubLoginId: sub,
      chaserLoginId: chaser,
    })
      .then(() => {
        setEditing(false);
        router.refresh();
      })
      .catch((e) => alert(e instanceof Error ? e.message : "更新に失敗しました"))
      .finally(() => setBusy(false));
  }

  function cancel() {
    setBuyer(buyerLoginId ?? "");
    setSub(buyerSubLoginId ?? "");
    setChaser(chaserLoginId ?? "");
    setEditing(false);
  }

  if (!editing) {
    const none = !buyerLoginId && !buyerSubLoginId && !chaserLoginId;
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={`${supplierLabel} の担当窓口を変更`}
        className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs hover:bg-[#f7f7f5]"
      >
        {none ? (
          <span className="text-[#a0a0a0]">未割当</span>
        ) : (
          <span className="font-mono">
            {buyerLoginId ?? "—"}
            {buyerSubLoginId && <span className="text-[#707070]">（{buyerSubLoginId}）</span>}
            <span className="mx-1 text-[#d5d5d5]">/</span>
            {chaserLoginId ?? "—"}
          </span>
        )}
        <Pencil className="h-3 w-3 text-[#a0a0a0]" />
      </button>
    );
  }

  const cell = "w-20 rounded border border-[#d5d5d5] px-1.5 py-1 font-mono text-xs focus:border-[#e11d48] focus:outline-none";
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  };

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={buyer}
        onChange={(e) => setBuyer(e.target.value)}
        onKeyDown={onKey}
        placeholder="バイヤー"
        title="企画グループ（主担当）の社員番号"
        className={cell}
      />
      <input
        value={sub}
        onChange={(e) => setSub(e.target.value)}
        onKeyDown={onKey}
        placeholder="副担当"
        title="企画グループ（副担当）の社員番号"
        className={cell}
      />
      <input
        value={chaser}
        onChange={(e) => setChaser(e.target.value)}
        onKeyDown={onKey}
        placeholder="チェイサー"
        title="管理グループ（チェイサー）の社員番号"
        className={cell}
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
        title="保存"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={cancel} className="rounded p-1 text-[#707070] hover:bg-[#f7f7f5]" title="キャンセル">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
