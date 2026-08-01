"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import type { PriceRequestLine } from "@/lib/types";

export interface ExportRow extends PriceRequestLine {
  reqNo: number | null;
  approvedAt: string | null;
  /** 既存レコード（mcframe 現行値）の有無。無い＝新規登録として出力される */
  base: unknown | null;
}

/**
 * MC取込CSV出力（承認済み明細の選択→CSVダウンロード）。
 * 出力時に「出力済み」を記録し、既定では未出力のみ表示する。
 */
export default function ExportForm({ rows }: { rows: ExportRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => !r.exportedAt).map((r) => r.id))
  );
  const [mark, setMark] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allChecked = useMemo(
    () => rows.length > 0 && rows.every((r) => selected.has(r.id)),
    [rows, selected]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function download() {
    if (selected.size === 0) {
      setError("出力する明細を選択してください。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/export/mc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineIds: [...selected], markExported: mark }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "出力に失敗しました。");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const fileName = m ? decodeURIComponent(m[1]) : "MC取込_購買単価.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      if (mark) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (s: string | null) => (s ? s.slice(0, 10).replace(/-/g, "/") : "—");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => void download()}
          disabled={busy || selected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[#e11d48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          選択した {selected.size} 件をCSV出力
        </button>
        <label className="flex items-center gap-2 text-sm text-[#555555]">
          <input
            type="checkbox"
            checked={mark}
            onChange={(e) => setMark(e.target.checked)}
            className="h-4 w-4 accent-[#e11d48]"
          />
          出力済みとして記録する
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

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
              <th className="px-2 py-2.5 font-medium">品目CD / 品名</th>
              <th className="px-2 py-2.5 font-medium">発注先</th>
              <th className="px-2 py-2.5 font-medium">適用開始</th>
              <th className="px-2 py-2.5 text-right font-medium">単価</th>
              <th className="px-2 py-2.5 text-right font-medium">改訂前</th>
              <th className="px-2 py-2.5 font-medium">区分</th>
              <th className="px-2 py-2.5 font-medium">承認日</th>
              <th className="px-2 py-2.5 font-medium">出力状況</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-[#f5f5f5] ${selected.has(r.id) ? "bg-[#f0f7ff]" : ""}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4 accent-[#e11d48]"
                  />
                </td>
                <td className="px-2 py-2 font-mono">#{r.reqNo}</td>
                <td className="px-2 py-2">
                  <span className="font-mono">{r.itemCd}{r.itemBranch ? `-${r.itemBranch}` : ""}</span>
                  <div className="text-xs text-[#707070]">{r.itemName ?? ""}</div>
                </td>
                <td className="px-2 py-2">
                  <span className="font-mono">{r.supplierCd}</span> {r.supplierName ?? ""}
                </td>
                <td className="px-2 py-2 text-xs">{fmtDate(r.startDate)}</td>
                <td className="px-2 py-2 text-right font-mono font-semibold">{r.newPrice}</td>
                <td className="px-2 py-2 text-right font-mono text-[#707070]">
                  {r.currentPrice ?? "—"}
                </td>
                <td className="px-2 py-2">
                  {r.base ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      改訂（既存項目を維持）
                    </span>
                  ) : (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      新規登録
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-xs">{fmtDate(r.approvedAt)}</td>
                <td className="px-2 py-2">
                  {r.exportedAt ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      出力済 {fmtDate(r.exportedAt)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                      未出力
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-[#707070]">対象の承認済み明細がありません。</p>
        )}
      </div>
    </div>
  );
}
