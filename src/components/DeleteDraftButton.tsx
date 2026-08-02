"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteRequestAction } from "@/lib/actions";

/**
 * 一覧から下書きを直接削除するボタン。
 * 下書き（と差し戻し）だけに出し、削除できるのは作成者本人と管理者。
 */
export default function DeleteDraftButton({
  requestId,
  label,
}: {
  requestId: string;
  /** 確認ダイアログに出す申請の見出し（申請No・タイトルなど） */
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        title="この下書きを削除"
        onClick={() => {
          if (!confirm(`${label} を削除しますか？（明細ごと削除され、元に戻せません）`)) return;
          setBusy(true);
          setError("");
          deleteRequestAction(requestId)
            .then((r) => {
              if (r.ok) router.refresh();
              else setError(r.message);
            })
            .catch((e) => setError(e instanceof Error ? e.message : "削除に失敗しました"))
            .finally(() => setBusy(false));
        }}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        削除
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
