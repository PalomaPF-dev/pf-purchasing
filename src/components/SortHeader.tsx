import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

/**
 * 並び替えできる表見出し。
 * クリックでその項目の昇順→降順を切り替える（現在の検索条件は保ったまま）。
 */
export default function SortHeader({
  label,
  sortKey,
  current,
  dir,
  href,
  align = "left",
  defaultDir = "asc",
}: {
  label: string;
  /** この見出しの並び替えキー */
  sortKey: string;
  /** 現在の並び替えキー */
  current: string;
  /** 現在の並び順 */
  dir: "asc" | "desc";
  /** キーと向きからリンク先を作る */
  href: (sort: string, dir: "asc" | "desc") => string;
  align?: "left" | "right";
  /** 最初にクリックしたときの向き（日付・単価は降順から見たいことが多い） */
  defaultDir?: "asc" | "desc";
}) {
  const active = current === sortKey;
  const next: "asc" | "desc" = active ? (dir === "asc" ? "desc" : "asc") : defaultDir;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={href(sortKey, next)}
      title={`${label}で並び替え`}
      className={`inline-flex items-center gap-1 hover:text-[#e11d48] ${
        active ? "font-bold text-[#e11d48]" : ""
      } ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      {label}
      <Icon className={`h-3 w-3 ${active ? "" : "text-[#c0c0c0]"}`} />
    </Link>
  );
}
