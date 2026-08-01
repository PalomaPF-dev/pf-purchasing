"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Check, Loader2, Search, X } from "lucide-react";

export interface PickedSupplier {
  code: string;
  name: string;
}

interface Candidate {
  code: string;
  name: string;
  itemCount: number;
}

/**
 * 発注先の選択（単価申請の起点）。
 * 単価申請は発注先ごとに行うため、まずここで発注先を確定させ、
 * 以降の明細ではその発注先の取引品目だけを選べるようにする。
 */
export default function SupplierPicker({
  value,
  onChange,
}: {
  value: PickedSupplier | null;
  onChange: (s: PickedSupplier | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  // 入力から少し待って検索（打鍵ごとのリクエストを抑える）
  useEffect(() => {
    if (!open) return;
    let aborted = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/lookup?type=supplier-picker&q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => ({}));
        if (!aborted) setCandidates(data.suppliers ?? []);
      } finally {
        if (!aborted) setLoading(false);
      }
    }, 250);
    return () => {
      aborted = true;
      clearTimeout(t);
    };
  }, [q, open]);

  // 外側クリックで閉じる
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e11d48]/30 bg-[#fff1f2] p-4">
        <Building2 className="h-5 w-5 shrink-0 text-[#e11d48]" />
        <div>
          <div className="text-[11px] font-medium text-[#9f1239]">発注先（この申請の対象）</div>
          <div className="text-sm font-bold text-[#333333]">
            <span className="font-mono">{value.code}</span>
            <span className="ml-2">{value.name || "（名称未設定）"}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQ("");
            setCandidates([]);
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-medium text-[#555555] hover:bg-[#f7f7f5]"
        >
          <X className="h-3.5 w-3.5" />
          発注先を変更
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative rounded-xl border border-[#e5e5e5] bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e11d48] text-xs font-bold text-white">
          1
        </span>
        <h2 className="text-sm font-bold text-[#333333]">発注先を選択してください</h2>
      </div>
      <p className="mb-3 text-xs text-[#707070]">
        単価申請は発注先ごとに作成します。発注先を選ぶと、その取引先の品目から選べるようになります。
      </p>
      <div className="relative max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a0a0a0]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="発注先CD・発注先名で検索（例: 00906 / 北陸電気）"
          className="w-full rounded-lg border border-[#d5d5d5] bg-white py-2 pl-9 pr-3 text-sm focus:border-[#e11d48] focus:outline-none focus:ring-1 focus:ring-[#e11d48]"
        />
      </div>

      {open && (
        <div className="absolute left-4 right-4 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-[#d5d5d5] bg-white shadow-lg">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-[#707070]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              検索中…
            </div>
          )}
          {!loading && candidates.length === 0 && (
            <div className="px-3 py-3 text-xs text-[#707070]">
              該当する発注先がありません。取引先マスタに登録されているかご確認ください。
            </div>
          )}
          {candidates.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                onChange({ code: c.code, name: c.name });
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 border-b border-[#f5f5f5] px-3 py-2 text-left last:border-b-0 hover:bg-[#fff1f2]"
            >
              <span className="font-mono text-sm text-[#333333]">{c.code}</span>
              <span className="flex-1 truncate text-sm">{c.name || "（名称未設定）"}</span>
              {c.itemCount > 0 && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                  取引品目 {c.itemCount.toLocaleString()}
                </span>
              )}
              <Check className="h-4 w-4 shrink-0 text-[#e11d48] opacity-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
