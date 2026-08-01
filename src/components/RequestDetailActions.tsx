"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { addMessageAction, deleteRequestAction, submitRequestAction } from "@/lib/actions";

/** 申請者向けの操作（提出・削除）。下書き/差し戻しのときのみ表示。 */
export function SubmitDeleteActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => {
          setBusy(true);
          setError("");
          submitRequestAction(requestId)
            .then(() => router.refresh())
            .catch((e) => setError(e instanceof Error ? e.message : "提出に失敗しました"))
            .finally(() => setBusy(false));
        }}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        申請を提出（承認へ回す）
      </button>
      <button
        onClick={() => {
          if (!confirm("この申請を削除しますか？（元に戻せません）")) return;
          setBusy(true);
          deleteRequestAction(requestId).catch((e) => {
            setError(e instanceof Error ? e.message : "削除に失敗しました");
            setBusy(false);
          });
        }}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
        削除
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

/** 承認スレッドへのコメント投稿フォーム */
export function MessageForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        addMessageAction(requestId, body)
          .then(() => {
            setBody("");
            router.refresh();
          })
          .finally(() => setBusy(false));
      }}
      className="flex gap-2"
    >
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="コメントを入力（申請者・承認者に共有されます）"
        className="flex-1 rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#e11d48] focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !body.trim()}
        className="rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
      >
        送信
      </button>
    </form>
  );
}
