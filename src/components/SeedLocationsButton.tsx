"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, DatabaseZap, Loader2 } from "lucide-react";
import { seedLocationsAction } from "@/lib/actions";

/**
 * 過去の単価履歴に出てくる納入場所CDを、納入場所マスタへ一括登録するボタン。
 * 名称は空で登録されるので、一覧の鉛筆アイコンから入力する
 * （単価改訂履歴の再取込でも名称が入る）。
 */
export default function SeedLocationsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setBusy(true);
          setMsg("");
          setError("");
          seedLocationsAction()
            .then((r) => {
              if (!r.ok) {
                setError(r.message);
                return;
              }
              setMsg(
                r.data.created > 0
                  ? `単価履歴から ${r.data.created.toLocaleString()} 件の納入場所CDを登録しました（履歴上の納入場所 ${r.data.found.toLocaleString()} 件）。名称は編集で入力してください。`
                  : `新しい納入場所CDはありませんでした（履歴上の納入場所 ${r.data.found.toLocaleString()} 件はすべて登録済み）。`
              );
              router.refresh();
            })
            .catch((e) => setError(e instanceof Error ? e.message : "取込に失敗しました"))
            .finally(() => setBusy(false));
        }}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-[#d5d5d5] bg-white px-4 py-2 text-sm font-medium text-[#555555] hover:bg-[#f7f7f5] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
        単価履歴から納入場所CDを取り込む
      </button>
      {msg && (
        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {msg}
        </span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
