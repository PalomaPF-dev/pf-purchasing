import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { listExportableLines } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import ExportForm from "@/components/ExportForm";

export const dynamic = "force-dynamic";

/** MC取込CSV出力（承認済み明細 → mcframe 購買単価取込フォーマット） */
export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const includeExported = sp.all === "1";
  const rows = await listExportableLines(session.companyId, { includeExported });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="MC取込出力"
        description="承認済みの単価明細を mcframe の購買単価取込フォーマット（CSV）で出力します。1〜2行目はフォーマットのヘッダ、3行目以降がデータです。"
        actions={
          <Link
            href={includeExported ? "/export" : "/export?all=1"}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              includeExported
                ? "bg-[#e11d48] text-white"
                : "border border-[#e5e5e5] bg-white text-[#555555] hover:bg-[#f7f7f5]"
            }`}
          >
            出力済みも表示
          </Link>
        }
      />
      <ExportForm rows={rows} />
    </div>
  );
}
