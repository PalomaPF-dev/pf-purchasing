"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { deleteItemAction, updateItemAction } from "@/lib/actions";
import type { Item } from "@/lib/types";

/**
 * 品番マスタの1行。「編集」で品名・科目・区分などをその場で修正できる。
 * 品目CD＋枝番は単価履歴・申請との紐付けキーのため変更できない。
 */
export default function ItemRow({ item }: { item: Item }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [f, setF] = useState({
    name: item.name,
    acctCd: item.acctCd ?? "",
    acctName: item.acctName ?? "",
    acctDetail: item.acctDetail ?? "",
    icsName: item.icsName ?? "",
    itemClass: item.itemClass ?? "",
    materialClass: item.materialClass ?? "",
    notes: item.notes ?? "",
    active: item.active,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  function reset() {
    setF({
      name: item.name,
      acctCd: item.acctCd ?? "",
      acctName: item.acctName ?? "",
      acctDetail: item.acctDetail ?? "",
      icsName: item.icsName ?? "",
      itemClass: item.itemClass ?? "",
      materialClass: item.materialClass ?? "",
      notes: item.notes ?? "",
      active: item.active,
    });
    setError("");
    setEditing(false);
  }

  function save() {
    setBusy(true);
    setError("");
    updateItemAction(item.id, f)
      .then(() => {
        setEditing(false);
        router.refresh();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "更新に失敗しました"))
      .finally(() => setBusy(false));
  }

  function remove() {
    if (!confirm(`品番 ${item.code} ${item.name} を削除しますか？`)) return;
    setBusy(true);
    deleteItemAction(item.id)
      .then(() => router.refresh())
      .catch((e) => setError(e instanceof Error ? e.message : "削除に失敗しました"))
      .finally(() => setBusy(false));
  }

  const dash = <span className="text-[#c0c0c0]">—</span>;

  if (!editing) {
    return (
      <tr className={`border-b border-[#f5f5f5] hover:bg-[#f7f7f5] ${item.active ? "" : "opacity-50"}`}>
        <td className="px-4 py-2 font-mono">{item.code}</td>
        <td className="px-2 py-2 font-mono text-xs">{item.branch ?? dash}</td>
        <td className="px-2 py-2">
          {item.name || dash}
          {!item.active && <span className="ml-2 text-xs text-[#a0a0a0]">（無効）</span>}
        </td>
        <td className="px-2 py-2 font-mono text-xs">{item.currentSupplierCd ?? dash}</td>
        <td className="px-2 py-2 text-xs">{item.currentSupplierName || dash}</td>
        <td className="px-2 py-2 font-mono text-xs">{item.acctCd ?? dash}</td>
        <td className="px-2 py-2 text-xs">{item.acctName ?? dash}</td>
        <td className="px-2 py-2 text-xs">{item.acctDetail ?? dash}</td>
        <td className="px-2 py-2 text-xs">{item.icsName ?? dash}</td>
        <td className="px-2 py-2 text-center text-xs">{item.itemClass ?? dash}</td>
        <td className="px-2 py-2 text-center text-xs">{item.materialClass ?? dash}</td>
        <td className="px-2 py-2 text-xs text-[#707070]">{item.currentStartDate ?? dash}</td>
        <td className="whitespace-nowrap px-2 py-2 text-right">
          {error && <span className="mr-2 text-xs text-red-600">{error}</span>}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-1.5 text-[#707070] hover:bg-[#f0f0f0]"
            title="編集"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
            title="削除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      </tr>
    );
  }

  const cell = "w-full min-w-16 rounded border border-[#d5d5d5] px-1.5 py-1 text-xs focus:border-[#e11d48] focus:outline-none";
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") reset();
  };

  return (
    <tr className="border-b border-[#f5f5f5] bg-[#fffbfb]">
      <td className="px-4 py-2 font-mono text-[#707070]" title="品目CDは変更できません">{item.code}</td>
      <td className="px-2 py-2 font-mono text-xs text-[#707070]">{item.branch ?? "—"}</td>
      <td className="px-2 py-2">
        <input autoFocus value={f.name} onChange={set("name")} onKeyDown={onKey} className={cell} />
      </td>
      <td className="px-2 py-2 font-mono text-xs text-[#707070]">{item.currentSupplierCd ?? "—"}</td>
      <td className="px-2 py-2 text-xs text-[#707070]">{item.currentSupplierName || "—"}</td>
      <td className="px-2 py-2">
        <input value={f.acctCd} onChange={set("acctCd")} onKeyDown={onKey} className={cell} />
      </td>
      <td className="px-2 py-2">
        <input value={f.acctName} onChange={set("acctName")} onKeyDown={onKey} className={cell} />
      </td>
      <td className="px-2 py-2">
        <input value={f.acctDetail} onChange={set("acctDetail")} onKeyDown={onKey} className={cell} />
      </td>
      <td className="px-2 py-2">
        <input value={f.icsName} onChange={set("icsName")} onKeyDown={onKey} className={cell} />
      </td>
      <td className="px-2 py-2">
        <input value={f.itemClass} onChange={set("itemClass")} onKeyDown={onKey} className={cell} />
      </td>
      <td className="px-2 py-2">
        <input value={f.materialClass} onChange={set("materialClass")} onKeyDown={onKey} className={cell} />
      </td>
      <td className="px-2 py-2 text-xs text-[#707070]">{item.currentStartDate ?? "—"}</td>
      <td className="whitespace-nowrap px-2 py-2 text-right align-top">
        {error && <span className="mr-2 text-xs text-red-600">{error}</span>}
        <label className="mr-2 inline-flex items-center gap-1 text-[10px] text-[#707070]">
          <input
            type="checkbox"
            checked={f.active}
            onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))}
          />
          有効
        </label>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
          title="保存"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button type="button" onClick={reset} className="rounded p-1.5 text-[#707070] hover:bg-[#f0f0f0]" title="キャンセル">
          <X className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
