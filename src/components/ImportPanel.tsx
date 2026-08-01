import { Upload } from "lucide-react";
import ImportForm, { type ImportKind } from "@/components/ImportForm";

/**
 * マスタ画面に埋め込む Excel/CSV 取込パネル（折りたたみ）。
 * 一括取込は各マスタの画面内で完結させ、独立したメニューは持たない。
 */
export default function ImportPanel({
  kinds,
  title = "Excel/CSVで一括登録",
}: {
  kinds: ImportKind[];
  title?: string;
}) {
  return (
    <details className="mb-4 rounded-xl border border-[#e5e5e5] bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-semibold text-[#e11d48]">
        <Upload className="h-4 w-4" />
        {title}
      </summary>
      <div className="border-t border-[#eeeeee] p-5">
        <ImportForm kinds={kinds} />
      </div>
    </details>
  );
}
