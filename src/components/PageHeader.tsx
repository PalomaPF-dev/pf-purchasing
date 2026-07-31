import type { ReactNode } from "react";

/** ページ見出し（タイトル＋説明＋右側アクション）。全ページ共通。 */
export default function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-[#333333]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[#707070]">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
