import { requireAdminPage } from "@/lib/session";
import { dashboardStats } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import MigrateForm from "@/components/MigrateForm";

export const dynamic = "force-dynamic";

/** 単価履歴のデータ移行（mcframe 単価情報 → 単価履歴） */
export default async function MigratePage() {
  const session = await requireAdminPage();
  const stats = await dashboardStats(session.companyId);
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageHeader
        title="データ移行"
        description="mcframe からエクスポートした現行の単価履歴（単価情報）を取り込み、改訂履歴を引き継ぎます。"
      />
      <MigrateForm historyCount={stats.historyCount} />
    </div>
  );
}
