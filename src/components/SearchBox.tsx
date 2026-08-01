import Link from "next/link";
import { Search, X } from "lucide-react";

/**
 * 一覧画面の検索ボックス（GETフォーム）。
 * 検索ボタンを明示的に置き、検索中は解除リンクとヒット件数を表示する。
 */
export default function SearchBox({
  action,
  q,
  placeholder,
  total,
  hidden = {},
  className = "mb-4",
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
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(hidden)) if (v) params.set(k, v);
  const clearHref = params.toString() ? `${action}?${params.toString()}` : action;

  return (
    <form action={action} method="GET" className={`flex flex-wrap items-center gap-2 ${className}`}>
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null
      )}
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="w-72 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none"
      />
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
