"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { approveManyAction, rejectManyAction } from "@/lib/actions";
import { REQUEST_STATUS_LABEL, type PriceRequest } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

/**
 * 承認一覧（一括承認・一括差し戻し）。
 * MGR承認待ちと部門長承認待ちは承認段階が異なるため、タブで切り替えてから
 * まとめて処理する（段階をまたいだ一括承認は行わない）。
 */
export default function BulkApprove({
  pending,
  mgrApproved,
  mgrLabel,
  deptLabel,
  stages,
}: {
  pending: PriceRequest[];
  mgrApproved: PriceRequest[];
  mgrLabel: string;
  deptLabel: string;
  stages: 1 | 2;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"mgr" | "dept">("mgr");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"none" | "approve" | "reject">("none");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const rows = stage === "mgr" ? pending : mgrApproved;
  const allChecked = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected]
  );

  function switchStage(next: "mgr" | "dept") {
    setStage(next);
    setSelected(new Set());
    setMessage("");
    setError("");
  }

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
          ? await approveManyAction(ids, stage, comment)
          : await rejectManyAction(ids, stage, comment);
      const label = action === "approve" ? "承認" : "差し戻し";
      setMessage(`${res.ok} 件を${label}しました。`);
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

  return (
    <div className="space-y-4">
      {/* 承認段階の切替（2段階運用のときのみ） */}
      {stages === 2 && (
        <div className="inline-flex rounded-lg border border-[#e5e5e5] bg-white p-1 text-sm">
          {(
            [
              ["mgr", `${mgrLabel}承認待ち`, pending.length],
              ["dept", `${deptLabel}承認待ち`, mgrApproved.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchStage(key)}
              className={`rounded-md px-3 py-1.5 font-medium ${
                stage === key ? "bg-[#e11d48] text-white" : "text-[#555555] hover:bg-[#f7f7f5]"
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs opacity-80">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* 一括操作 */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="mb-2 text-sm font-bold text-amber-900">
          選択した申請を{stage === "mgr" ? mgrLabel : deptLabel}としてまとめて処理します
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="コメント（承認時は任意・差し戻し時は必須）。選択した全件に同じコメントが記録されます。"
          className="mb-3 w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#e11d48] focus:outline-none"
        />
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void run("approve")}
            disabled={busy !== "none" || selected.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            選択した {selected.size} 件を{stage === "mgr" ? mgrLabel : deptLabel}承認
          </button>
          <button
            onClick={() => void run("reject")}
            disabled={busy !== "none" || selected.size === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Undo2 className="h-4 w-4" />
            選択した {selected.size} 件を差し戻す
          </button>
        </div>
        {message && <p className="mt-2 text-sm font-medium text-emerald-700">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#707070]">
          {stage === "mgr" ? mgrLabel : deptLabel}承認待ちの申請はありません。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
                <th className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() =>
                      setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))
                    }
                    className="h-4 w-4 accent-[#e11d48]"
                  />
                </th>
                <th className="px-2 py-2.5 font-medium">申請No</th>
                <th className="px-2 py-2.5 font-medium">タイトル / 取引先</th>
                <th className="px-2 py-2.5 font-medium">明細</th>
                <th className="px-2 py-2.5 font-medium">申請者</th>
                <th className="px-2 py-2.5 font-medium">提出日時</th>
                <th className="px-2 py-2.5 font-medium">状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-[#f5f5f5] ${selected.has(r.id) ? "bg-[#fff1f2]" : "hover:bg-[#f7f7f5]"}`}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="h-4 w-4 accent-[#e11d48]"
                    />
                  </td>
                  <td className="px-2 py-2.5 font-mono">
                    <Link href={`/requests/${r.id}`} className="font-semibold text-[#e11d48] hover:underline">
                      {r.reqCode ?? `#${r.reqNo}`}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    <Link href={`/requests/${r.id}`} className="hover:underline">
                      {r.title || r.supplierSummary || "—"}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">{r.lineCount ?? 0} 件</td>
                  <td className="px-2 py-2.5">{r.applicantName ?? "—"}</td>
                  <td className="px-2 py-2.5 text-xs">{formatDateTime(r.submittedAt)}</td>
                  <td className="px-2 py-2.5">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {REQUEST_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
