import { requireAdminPage } from "@/lib/session";
import PageHeader from "@/components/PageHeader";
import ImportForm from "@/components/ImportForm";

export const dynamic = "force-dynamic";

/** 一括取込（単価申請・品番マスタ・取引先マスタ） */
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageHeader
        title="一括取込"
        description="Excel/CSV から単価申請の明細やマスタを一括登録します。テンプレートのヘッダに合わせて作成してください。"
      />
      <ImportForm initialTab={sp.tab} />
    </div>
  );
}
