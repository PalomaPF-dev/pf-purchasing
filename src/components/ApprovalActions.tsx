"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Undo2 } from "lucide-react";
import { approveRequestAction, rejectRequestAction } from "@/lib/actions";
import type { ApprovalStage } from "@/lib/types";

/**
 * 承認・差し戻し操作（管理者のみ表示される）。
 * stage は申請の現在状態から決まる（pending→mgr、mgr_approved→dept）。
 */
export default function ApprovalActions({
  requestId,
  stage,
  stageLabel,
}: {
  requestId: string;
  stage: ApprovalStage;
  stageLabel: string;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"none" | "approve" | "reject">("none");
  const [error, setError] = useState("");

  async function run(action: "approve" | "reject") {
    if (action === "reject" && !comment.trim()) {
      setError("差し戻しの理由をコメントに入力してください。");
      return;
    }
    setError("");
    setBusy(action);
    try {
      if (action === "approve") {
        await approveRequestAction(requestId, stage, comment);
      } else {
        await rejectRequestAction(requestId, stage, comment);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました。");
    } finally {
      setBusy("none");
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-2 text-sm font-bold text-amber-800">{stageLabel}承認の操作</div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="コメント（承認時は任意・差し戻し時は必須）"
        className="mb-3 w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#e11d48] focus:outline-none"
      />
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <button
          onClick={() => void run("approve")}
          disabled={busy !== "none"}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          {busy === "approve" ? "承認中…" : `${stageLabel}承認する`}
        </button>
        <button
          onClick={() => void run("reject")}
          disabled={busy !== "none"}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Undo2 className="h-4 w-4" />
          {busy === "reject" ? "差し戻し中…" : "差し戻す"}
        </button>
      </div>
    </div>
  );
}
