"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { approveSelectedAction, rejectSelectedAction } from "@/lib/actions";
import { REQUEST_STATUS_LABEL, type ApprovalStage, type PriceRequest, type RequestStatus } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import DeleteDraftButton from "@/components/DeleteDraftButton";

/**
 * 単価申請の一覧。自分がいま承認できる申請にはチェックボックスが付き、
 * 選んでまとめて承認・差し戻しできる。
 * MGR承認待ちと部門長承認待ちが混ざっていても、段階はサーバ側で
 * 申請ごとに判定するのでそのまま処理できる。
 */
export default function RequestsTable({
  requests,
  approvable,
  stageLabels,
  isAdmin,
  loginId,
}: {
  requests: PriceRequest[];
  /** 自分がいま承認できる申請ID → その段階 */
  approvable: Record<string, ApprovalStage>;
  stageLabels: Record<ApprovalStage, string>;
  isAdmin: boolean;
  loginId: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"none" | "approve" | "reject">("none");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const targets = useMemo(() => requests.filter((r) => approvable[r.id]), [requests, approvable]);
  const allChecked = targets.length > 0 && targets.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: "approve" | "reject") {
    if (selected.size === 0) {
      setError("対象の申請を選択してください。");
      return;
    }
    if (action === "reject" && !comment.trim()) {
      setError("差し戻しの理由をコメントに入力してください。");
      return;
    }
    setError("");
    setMessage("");
    setBusy(action);
    try {
      const ids = [...selected];
      const res =
        action === "approve"
          ? await approveSelectedAction(ids, comment)
          : await rejectSelectedAction(ids, comment);
      setMessage(`${res.ok} 件を${action === "approve" ? "承認" : "差し戻し"}しました。`);
      if (res.failed.length > 0) {
        setError(
          `${res.failed.length} 件は処理できませんでした: ${res.failed
            .slice(0, 3)
            .map((f) => f.message)
            .join(" / ")}`
        );
      }
      setSelected(new Set());
      setComment("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました。");
    } finally {
      setBusy("none");
    }
  }

  /** 選択中の申請がどの段階か（表示用・複数段階が混ざることもある） */
  const stagesOfSelection = [
    ...new Set([...selected].map((id) => approvable[id]).filter(Boolean)),
  ].map((st) => stageLabels[st]);

  return (
    <div className="space-y-3">
      {/* 一括承認（承認できる申請があるときだけ出す） */}
      {targets.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 text-sm font-bold text-amber-900">
            この一覧の中に、あなたがいま承認できる申請が {targets.length} 件あります
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="コメント（承認時は任意・差し戻し時は必須）。選択した全件に同じコメントが記録されます。"
            className="mb-3 w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#e11d48] focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setSelected(allChecked ? new Set() : new Set(targets.map((r) => r.id)))}
              className="rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm text-[#555555] hover:bg-white/70"
            >
              {allChecked ? "選択を解除" : `承認できる ${targets.length} 件をすべて選択`}
            </button>
            <button
              type="button"
              onClick={() => void run("approve")}
              disabled={busy !== "none" || selected.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === "approve" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              選択した {selected.size} 件を承認
            </button>
            <button
              type="button"
              onClick={() => void run("reject")}
              disabled={busy !== "none" || selected.size === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" />
              選択した {selected.size} 件を差し戻す
            </button>
            {stagesOfSelection.length > 0 && (
              <span className="text-xs text-amber-900">
                承認する段階: {stagesOfSelection.join("・")}
              </span>
            )}
          </div>
          {message && <p className="mt-2 text-sm font-medium text-emerald-700">{message}</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
              {targets.length > 0 && (
                <th className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() =>
                      setSelected(allChecked ? new Set() : new Set(targets.map((r) => r.id)))
                    }
                    className="h-4 w-4 accent-[#e11d48]"
                    title="承認できる申請をすべて選択"
                  />
                </th>
              )}
              <th className="px-4 py-2.5 font-medium">申請No</th>
              <th className="px-2 py-2.5 font-medium">タイトル / 取引先</th>
              <th className="px-2 py-2.5 font-medium">明細</th>
              <th className="px-2 py-2.5 font-medium">申請者</th>
              <th className="px-2 py-2.5 font-medium">提出日時</th>
              <th className="px-2 py-2.5 font-medium">状態</th>
              <th className="px-2 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const stage = approvable[r.id];
              return (
                <tr
                  key={r.id}
                  className={`border-b border-[#f5f5f5] ${
                    selected.has(r.id) ? "bg-[#fff1f2]" : "hover:bg-[#f7f7f5]"
                  }`}
                >
                  {targets.length > 0 && (
                    <td className="px-3 py-2.5">
                      {stage ? (
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          className="h-4 w-4 accent-[#e11d48]"
                          title={`${stageLabels[stage]}として承認`}
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="px-4 py-2.5 font-mono">
                    <Link
                      href={`/requests/${r.id}`}
                      className="font-semibold text-[#e11d48] hover:underline"
                    >
                      {r.reqCode ?? "（下書き）"}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    <Link href={`/requests/${r.id}`} className="hover:underline">
                      {r.title || r.supplierSummary || "—"}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">{r.lineCount ?? 0} 件</td>
                  <td className="px-2 py-2.5">{r.applicantName ?? "—"}</td>
                  <td className="px-2 py-2.5 text-xs">
                    {formatDateTime(r.submittedAt ?? r.createdAt)}
                  </td>
                  <td className="px-2 py-2.5">
                    <StatusBadge status={r.status} />
                    {stage && (
                      <span className="ml-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        あなたの承認待ち
                      </span>
                    )}
                  </td>
                  {/* 下書き・差し戻しは一覧からそのまま削除できる（本人と管理者のみ） */}
                  <td className="px-2 py-2.5 text-right">
                    {(r.status === "draft" || r.status === "rejected") &&
                      (isAdmin || r.applicantLoginId === loginId) && (
                        <DeleteDraftButton
                          requestId={r.id}
                          label={r.reqCode ?? r.title ?? "この下書き"}
                        />
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RequestStatus }) {
  const color =
    status === "approved"
      ? "bg-emerald-50 text-emerald-700"
      : status === "rejected"
        ? "bg-red-50 text-red-700"
        : status === "draft"
          ? "bg-slate-100 text-slate-600"
          : "bg-amber-50 text-amber-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {REQUEST_STATUS_LABEL[status]}
    </span>
  );
}
