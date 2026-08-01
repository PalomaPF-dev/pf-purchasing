"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { setSupplierBuyerAction } from "@/lib/actions";

/**
 * 担当バイヤーの割当（取引先マスタの1行分）。
 * 社員番号を設定すると、そのバイヤーだけがこの発注先を閲覧・申請できるようになる。
 * 空にすると未割当（管理者のみが扱える状態）に戻る。
 */
export default function BuyerAssign({
  supplierId,
  buyerLoginId,
  supplierLabel,
}: {
  supplierId: string;
  buyerLoginId: string | null;
  supplierLabel: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(buyerLoginId ?? "");
  const [busy, setBusy] = useState(false);

  function save() {
    setBusy(true);
    setSupplierBuyerAction(supplierId, value)
      .then(() => {
        setEditing(false);
        router.refresh();
      })
      .catch((e) => alert(e instanceof Error ? e.message : "更新に失敗しました"))
      .finally(() => setBusy(false));
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={`${supplierLabel} の担当バイヤーを変更`}
        className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs hover:bg-[#f7f7f5]"
      >
        {buyerLoginId ? (
          <span className="font-mono">{buyerLoginId}</span>
        ) : (
          <span className="text-[#a0a0a0]">未割当</span>
        )}
        <Pencil className="h-3 w-3 text-[#a0a0a0]" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="社員番号"
        className="w-24 rounded border border-[#d5d5d5] px-1.5 py-1 font-mono text-xs focus:border-[#e11d48] focus:outline-none"
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
      <button
        type="button"
        onClick={() => {
          setValue(buyerLoginId ?? "");
          setEditing(false);
        }}
        className="rounded p-1 text-[#707070] hover:bg-[#f7f7f5]"
        title="キャンセル"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
