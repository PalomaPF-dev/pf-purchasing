"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

/** 確認つき削除ボタン（マスタ行用）。action にはサーバーアクションを渡す。 */
export default function DeleteButton({
  action,
  confirmText,
}: {
  action: () => Promise<void>;
  confirmText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={() => {
        if (!confirm(confirmText)) return;
        setBusy(true);
        action()
          .then(() => router.refresh())
          .catch((e) => alert(e instanceof Error ? e.message : "削除に失敗しました"))
          .finally(() => setBusy(false));
      }}
      disabled={busy}
      className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
      title="削除"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
