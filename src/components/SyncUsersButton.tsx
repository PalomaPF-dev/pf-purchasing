"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { syncUsersAction } from "@/lib/actions";

/** 社員マスタ → ログインユーザー・承認者の反映ボタン（管理者のみ） */
export default function SyncUsersButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  return (
    <div>
      <button
        onClick={() => {
          setBusy(true);
          setMsg("");
          setError("");
          syncUsersAction()
            .then((r) => {
              setMsg(
                `ユーザーを ${r.created} 名 新規登録、${r.updated} 名 更新しました。` +
                  `承認者は MGR ${r.mgr} 名 / 部門長 ${r.dept} 名 を設定しました。`
              );
              router.refresh();
            })
            .catch((e) => setError(e instanceof Error ? e.message : "登録に失敗しました"))
            .finally(() => setBusy(false));
        }}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-[#e11d48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        {busy ? "登録中…" : "社員マスタからユーザーを登録 / 更新"}
      </button>
      {msg && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      )}
    </div>
  );
}
