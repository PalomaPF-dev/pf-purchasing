"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { deleteLocationAction, updateLocationAction } from "@/lib/actions";
import type { LocationRow as Loc } from "@/lib/db";

/**
 * 納入場所マスタの1行。「編集」で名称・備考をその場で修正できる。
 * 納入場所CDは単価履歴との紐付けキーのため変更できない。
 */
export default function LocationRow({ loc }: { loc: Loc }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [f, setF] = useState({
    name: loc.name,
    notes: loc.notes ?? "",
    active: loc.active,
  });

  function reset() {
    setF({ name: loc.name, notes: loc.notes ?? "", active: loc.active });
    setError("");
    setEditing(false);
  }

  function save() {
    setBusy(true);
    setError("");
    updateLocationAction(loc.id, f.name, f.notes, f.active)
      .then((r) => {
        if (!r.ok) {
          setError(r.message);
          return;
        }
        setEditing(false);
        router.refresh();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "更新に失敗しました"))
      .finally(() => setBusy(false));
  }

  function remove() {
    const used = loc.useCount ?? 0;
    const warn = used > 0 ? `\n※ この納入場所の単価履歴が ${used.toLocaleString()} 件あります（履歴は消えませんが、名称は表示されなくなります）。` : "";
    if (!confirm(`納入場所 ${loc.code} ${loc.name} を削除しますか？${warn}`)) return;
    setBusy(true);
    deleteLocationAction(loc.id)
      .then((r) => (r.ok ? router.refresh() : setError(r.message)))
      .catch((e) => setError(e instanceof Error ? e.message : "削除に失敗しました"))
      .finally(() => setBusy(false));
  }

  const cell = "px-2 py-2 align-top";
  const input = "w-full rounded border border-[#d5d5d5] px-2 py-1 text-sm";

  if (editing) {
    return (
      <tr className="border-b border-[#f5f5f5] bg-[#fffbfb]">
        <td className={`${cell} font-mono`}>{loc.code}</td>
        <td className={cell}>
          <input className={input} value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
        </td>
        <td className={cell}>
          <input className={input} value={f.notes} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} />
        </td>
        <td className={cell}>
          <label className="flex items-center gap-1.5 text-xs text-[#555555]">
            <input
              type="checkbox"
              checked={f.active}
              onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))}
            />
            有効
          </label>
        </td>
        <td className={`${cell} text-right text-xs text-[#707070]`}>
          {(loc.useCount ?? 0).toLocaleString()}
        </td>
        <td className={`${cell} whitespace-nowrap text-right`}>
          <button onClick={save} disabled={busy} className="mr-1 rounded p-1 text-emerald-600 hover:bg-emerald-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button onClick={reset} disabled={busy} className="rounded p-1 text-[#909090] hover:bg-[#f5f5f5]">
            <X className="h-4 w-4" />
          </button>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-[#f5f5f5] hover:bg-[#f7f7f5]">
      <td className={`${cell} font-mono`}>{loc.code}</td>
      <td className={cell}>{loc.name || <span className="text-[#c0c0c0]">（名称未登録）</span>}</td>
      <td className={`${cell} text-xs text-[#707070]`}>{loc.notes || "—"}</td>
      <td className={cell}>
        {loc.active ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">有効</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">無効</span>
        )}
      </td>
      <td className={`${cell} text-right text-xs text-[#707070]`}>{(loc.useCount ?? 0).toLocaleString()}</td>
      <td className={`${cell} whitespace-nowrap text-right`}>
        <button onClick={() => setEditing(true)} className="mr-1 rounded p-1 text-[#707070] hover:bg-[#f5f5f5]" title="編集">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={remove} disabled={busy} className="rounded p-1 text-red-500 hover:bg-red-50" title="削除">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
        {error && <div className="text-xs text-red-600">{error}</div>}
      </td>
    </tr>
  );
}
