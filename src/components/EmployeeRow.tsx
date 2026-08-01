"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { deleteEmployeeAction, updateEmployeeAction } from "@/lib/actions";
import type { Employee } from "@/lib/db";

const WF_LABEL: Record<string, string> = { mgr: "MGR", dept: "部門長" };

/**
 * 社員マスタの1行。「編集」で氏名・承認W/F・権限・メール・状態をその場で修正できる。
 * 社員番号はログインユーザー・承認者との紐付けキーのため変更できない。
 */
export default function EmployeeRow({ employee }: { employee: Employee }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(employee.name);
  const [wfRole, setWfRole] = useState<string>(employee.wfRole ?? "");
  const [role, setRole] = useState<string>(employee.role);
  const [email, setEmail] = useState(employee.email ?? "");
  const [active, setActive] = useState(employee.active);

  function reset() {
    setName(employee.name);
    setWfRole(employee.wfRole ?? "");
    setRole(employee.role);
    setEmail(employee.email ?? "");
    setActive(employee.active);
    setError("");
    setEditing(false);
  }

  function save() {
    setBusy(true);
    setError("");
    updateEmployeeAction(employee.id, {
      name,
      wfRole: wfRole === "mgr" || wfRole === "dept" ? wfRole : null,
      role: role === "admin" ? "admin" : "member",
      email,
      active,
    })
      .then(() => {
        setEditing(false);
        router.refresh();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "更新に失敗しました"))
      .finally(() => setBusy(false));
  }

  function remove() {
    if (
      !confirm(
        `社員 ${employee.loginId} ${employee.name} を社員マスタから削除しますか？（ログインユーザーは削除されません）`
      )
    )
      return;
    setBusy(true);
    deleteEmployeeAction(employee.id)
      .then(() => router.refresh())
      .catch((e) => setError(e instanceof Error ? e.message : "削除に失敗しました"))
      .finally(() => setBusy(false));
  }

  const cell = "w-full rounded border border-[#d5d5d5] px-2 py-1 text-sm focus:border-[#e11d48] focus:outline-none";

  if (!editing) {
    return (
      <tr className={`border-b border-[#f5f5f5] hover:bg-[#f7f7f5] ${employee.active ? "" : "opacity-50"}`}>
        <td className="px-4 py-2 font-mono">{employee.loginId}</td>
        <td className="px-2 py-2">
          {employee.name || <span className="text-[#a0a0a0]">—</span>}
          {!employee.active && <span className="ml-2 text-xs text-[#a0a0a0]">（無効）</span>}
        </td>
        <td className="px-2 py-2">
          {employee.wfRole ? (
            <span className="rounded-full bg-[#fff1f2] px-2 py-0.5 text-xs font-medium text-[#e11d48]">
              {WF_LABEL[employee.wfRole]}
            </span>
          ) : (
            <span className="text-[#a0a0a0]">—</span>
          )}
        </td>
        <td className="px-2 py-2">{employee.role === "admin" ? "管理者" : "一般"}</td>
        <td className="px-2 py-2 text-xs">
          {employee.email || <span className="text-[#a0a0a0]">—</span>}
        </td>
        <td className="px-2 py-2 text-xs">
          {employee.userExists ? (
            <span className="text-emerald-700">登録済</span>
          ) : (
            <span className="text-[#a0a0a0]">未登録</span>
          )}
        </td>
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

  return (
    <tr className="border-b border-[#f5f5f5] bg-[#fffbfb]">
      <td className="px-4 py-2 font-mono text-[#707070]" title="社員番号は変更できません">
        {employee.loginId}
      </td>
      <td className="px-2 py-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") reset();
          }}
          className={cell}
        />
      </td>
      <td className="px-2 py-2">
        <select value={wfRole} onChange={(e) => setWfRole(e.target.value)} className={cell}>
          <option value="">（承認者でない）</option>
          <option value="mgr">MGR</option>
          <option value="dept">部門長</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={cell}>
          <option value="member">一般</option>
          <option value="admin">管理者</option>
        </select>
      </td>
      <td className="px-2 py-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="メールアドレス"
          className={cell}
        />
      </td>
      <td className="px-2 py-2 text-xs">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          有効
        </label>
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right">
        {error && <span className="mr-2 text-xs text-red-600">{error}</span>}
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
          title="保存"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded p-1.5 text-[#707070] hover:bg-[#f0f0f0]"
          title="キャンセル"
        >
          <X className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
