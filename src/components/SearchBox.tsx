"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

export type SuggestScope = "prices" | "items" | "suppliers" | "locations" | "employees";

interface Suggestion {
  kind: "item" | "supplier" | "location" | "employee";
  code: string;
  name: string;
}

const KIND_LABEL: Record<Suggestion["kind"], string> = {
  item: "品番",
  supplier: "取引先",
  location: "納入場所",
  employee: "社員",
};

/**
 * 一覧画面の検索ボックス（GETフォーム）。
 * scope を渡すと入力に応じてマスタから候補を出し、選ぶとそのCDで検索する。
 * 検索ボタンを明示的に置き、検索中は解除リンクとヒット件数を表示する。
 */
export default function SearchBox({
  action,
  q,
  placeholder,
  total,
  hidden = {},
  className = "mb-4",
  scope,
}: {
  /** 送信先のパス（例: "/items"） */
  action: string;
  /** 現在の検索語 */
  q: string;
  placeholder: string;
  /** 検索中に表示するヒット件数 */
  total?: number;
  /** 検索と一緒に引き継ぐクエリ（絞り込みタブなど） */
  hidden?: Record<string, string | undefined>;
  className?: string;
  /** 候補を出す対象。未指定なら候補なし（従来どおりの検索だけ） */
  scope?: SuggestScope;
}) {
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(q);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(hidden)) if (v) params.set(k, v);
  const clearHref = params.toString() ? `${action}?${params.toString()}` : action;

  // 入力に追従して候補を取得（打鍵ごとには投げない）
  useEffect(() => {
    if (!scope || !open) return;
    const term = value.trim();
    // 空欄のときは候補を出さない（候補一覧のクリアは入力側で行う）
    if (!term) return;
    let aborted = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/lookup?type=suggest&scope=${scope}&q=${encodeURIComponent(term)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!aborted) {
          setList(data.suggestions ?? []);
          setActive(-1);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }, 200);
    return () => {
      aborted = true;
      clearTimeout(t);
    };
  }, [value, open, scope]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  /** 候補を選んだら、そのCDで検索する */
  const pick = useCallback(
    (s: Suggestion) => {
      setValue(s.code);
      setOpen(false);
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(hidden)) if (v) p.set(k, v);
      p.set("q", s.code);
      router.push(`${action}?${p.toString()}`);
    },
    [action, hidden, router]
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || list.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % list.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? list.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      // 候補を選んでいるときだけ、その候補で検索する（未選択なら通常の送信）
      e.preventDefault();
      pick(list[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form action={action} method="GET" className={`flex flex-wrap items-center gap-2 ${className}`}>
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null
      )}
      <div ref={boxRef} className="relative">
        <input
          name="q"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            if (e.target.value.trim() === "") setList([]);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          placeholder={placeholder}
          className="w-72 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none"
        />
        {scope && open && value.trim() !== "" && (loading || list.length > 0) && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-[26rem] max-w-[90vw] overflow-y-auto rounded-lg border border-[#d5d5d5] bg-white shadow-xl">
            {loading && list.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-[#707070]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                検索中…
              </div>
            )}
            {list.map((s, i) => (
              <button
                key={`${s.kind}-${s.code}-${i}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={`flex w-full items-center gap-2 border-b border-[#f5f5f5] px-3 py-2 text-left last:border-b-0 ${
                  i === active ? "bg-[#fff1f2]" : "hover:bg-[#fff1f2]"
                }`}
              >
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                  {KIND_LABEL[s.kind]}
                </span>
                <span className="shrink-0 font-mono text-sm text-[#333333]">{s.code}</span>
                <span className="flex-1 truncate text-xs text-[#707070]">
                  {s.name || "（名称未登録）"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg bg-[#e11d48] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#be123c]"
      >
        <Search className="h-4 w-4" />
        検索
      </button>
      {q && (
        <>
          <Link
            href={clearHref}
            className="inline-flex items-center gap-1 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm text-[#555555] hover:bg-[#f7f7f5]"
          >
            <X className="h-4 w-4" />
            解除
          </Link>
          {total != null && (
            <span className="text-sm text-[#707070]">
              「{q}」の検索結果 {total.toLocaleString()} 件
            </span>
          )}
        </>
      )}
    </form>
  );
}
