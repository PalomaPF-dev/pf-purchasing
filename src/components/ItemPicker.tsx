"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

export interface PickedItem {
  code: string;
  branch: string | null;
  name: string;
  unitCd: string | null;
  lotQty: number | null;
  currentPrice: number | null;
  startDate: string | null;
  endDate: string | null;
  locCd: string | null;
  dlvCd: string | null;
}

/**
 * 品目の選択（取引先を選んだ後）。
 * 選択した取引先の単価履歴から候補を出し、品名・単位・ロット・現行単価をまとめて返す。
 * 履歴にない新規品目は入力値をそのまま採用できる。
 */
export default function ItemPicker({
  supplierCd,
  value,
  onPick,
  onTextChange,
}: {
  supplierCd: string;
  /** 現在の品目CD（入力値） */
  value: string;
  onPick: (item: PickedItem) => void;
  onTextChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PickedItem[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  // 候補リストは明細テーブル（横スクロール）の外側に固定配置で描く。
  // absolute のままだと overflow コンテナに切られて候補が見えなくなるため。
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    const onMove = () => measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, measure]);

  // 入力値は親（明細の品目CD）が保持するため、検索キーもそれをそのまま使う
  useEffect(() => {
    if (!open || !supplierCd) return;
    let aborted = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/lookup?type=supplier-items&supplier=${encodeURIComponent(supplierCd)}&q=${encodeURIComponent(value)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!aborted) setItems(data.items ?? []);
      } finally {
        if (!aborted) setLoading(false);
      }
    }, 250);
    return () => {
      aborted = true;
      clearTimeout(t);
    };
  }, [value, open, supplierCd]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a0a0a0]" />
      <input
        className="w-full rounded border border-[#d5d5d5] bg-white py-1.5 pl-7 pr-2 font-mono text-sm focus:border-[#e11d48] focus:outline-none focus:ring-1 focus:ring-[#e11d48]"
        value={value}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          measure();
        }}
        placeholder="品目CD・品名で検索"
      />
      {open && supplierCd && rect && (
        <div
          style={{ left: rect.left, top: rect.top, minWidth: Math.max(rect.width, 360) }}
          className="fixed z-50 max-h-72 w-[30rem] max-w-[90vw] overflow-y-auto rounded-lg border border-[#d5d5d5] bg-white shadow-xl">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-[#707070]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              検索中…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="px-3 py-3 text-xs text-[#707070]">
              この取引先の取引履歴に該当がありません。新規品目の場合はそのまま品目CDを入力してください。
            </div>
          )}
          {items.map((it, i) => (
            <button
              key={`${it.code}-${it.branch ?? ""}-${it.locCd ?? ""}-${i}`}
              type="button"
              onClick={() => {
                onPick(it);
                setOpen(false);
              }}
              className="flex w-full flex-col gap-0.5 border-b border-[#f5f5f5] px-3 py-2 text-left last:border-b-0 hover:bg-[#fff1f2]"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-[#333333]">
                  {it.code}
                  {it.branch ? `-${it.branch}` : ""}
                </span>
                {it.locCd && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    納入場所 {it.locCd}
                  </span>
                )}
                <span className="ml-auto font-mono text-sm text-[#e11d48]">
                  {it.currentPrice != null ? it.currentPrice.toLocaleString("ja-JP") : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#707070]">
                <span className="flex-1 truncate">{it.name || "（品名未登録）"}</span>
                {it.startDate && <span className="shrink-0">適用 {it.startDate.replace(/-/g, "/")}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
