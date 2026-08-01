import { requireAdminPage } from "@/lib/session";
import { migrationStatus } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import MigrateForm from "@/components/MigrateForm";

export const dynamic = "force-dynamic";

/**
 * 初期データ移行（運用開始時の1回限り）。
 * mcframe の単価情報から過去の単価履歴を引き継ぎ、以後はこのアプリの単価申請で
 * 履歴が積み上がっていく。日常運用で繰り返し使う機能ではない。
 */
export default async function MigratePage() {
  const session = await requireAdminPage();
  const status = await migrationStatus(session.companyId);
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageHeader
        title="初期データ移行"
        description="運用開始時に一度だけ実施する作業です。mcframe の単価情報から過去の単価履歴を引き継ぎます。以後の単価はこのアプリの単価申請・承認で履歴に積み上がります。"
      />
      <MigrateForm
        migrated={status.done}
        migratedCount={status.count}
        migratedAt={status.lastAt}
      />
    </div>
  );
}
