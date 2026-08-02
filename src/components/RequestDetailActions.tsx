"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, Undo2 } from "lucide-react";
import {
  addMessageAction,
  cancelApprovalAction,
  deleteRequestAction,
  submitRequestAction,
  withdrawRequestAction,
} from "@/lib/actions";

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
            .then((r) => (r.ok ? router.refresh() : setError(r.message)))
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
          if (!confirm("この下書きを削除しますか？（明細ごと削除され、元に戻せません）")) return;
          setBusy(true);
          setError("");
          deleteRequestAction(requestId)
            .then((r) => {
              if (r.ok) router.push("/requests");
              else {
                setError(r.message);
                setBusy(false);
              }
            })
            .catch((e) => {
              setError(e instanceof Error ? e.message : "削除に失敗しました");
              setBusy(false);
            });
        }}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
        下書きを削除
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

/**
 * 提出後の申請を下書きに戻す（取り下げ）。申請者本人と管理者に表示。
 * 下書きに戻せば、通常どおり修正・再提出・削除ができる。
 */
export function WithdrawAction({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => {
          const reason = prompt("申請を取り下げて下書きに戻します。理由があれば入力してください（任意）。");
          if (reason === null) return;
          setBusy(true);
          setError("");
          withdrawRequestAction(requestId, reason)
            .then((r) => (r.ok ? router.refresh() : setError(r.message)))
            .catch((e) => setError(e instanceof Error ? e.message : "取り下げに失敗しました"))
            .finally(() => setBusy(false));
        }}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-[#d5d5d5] bg-white px-4 py-2 text-sm font-semibold text-[#555555] hover:bg-[#f7f7f5] disabled:opacity-50"
      >
        <Undo2 className="h-4 w-4" />
        申請を取り下げる（下書きに戻して修正）
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

/**
 * 承認済み申請の取り消し（管理者のみ）。
 * 単価履歴に反映済みの行を削除し、直前の単価を元に戻して下書きに戻す。
 */
export function CancelApprovalAction({
  requestId,
  exportedCount,
}: {
  requestId: string;
  exportedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => {
          if (
            !confirm(
              "この申請の承認を取り消します。\n単価履歴に反映された単価を削除し、直前の単価を元に戻したうえで下書きに戻します。\n続けますか？"
            )
          )
            return;
          let force = false;
          if (exportedCount > 0) {
            force = confirm(
              `この申請は既にMC取込CSVに出力済みです（${exportedCount}件）。\nmcframe 側の単価も戻す必要があります。\nそれでも取り消しますか？`
            );
            if (!force) return;
          }
          const reason = prompt("取り消しの理由を入力してください（任意）。");
          if (reason === null) return;
          setBusy(true);
          setError("");
          cancelApprovalAction(requestId, reason, force)
            .then((r) => (r.ok ? router.refresh() : setError(r.message)))
            .catch((e) => setError(e instanceof Error ? e.message : "取り消しに失敗しました"))
            .finally(() => setBusy(false));
        }}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        <Undo2 className="h-4 w-4" />
        承認を取り消して修正する
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
