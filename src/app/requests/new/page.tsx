import { requireSession } from "@/lib/session";
import { todayJST } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import RequestForm from "@/components/RequestForm";

export const dynamic = "force-dynamic";

/** 単価申請の新規作成（見積書AI取り込み対応） */
export default async function NewRequestPage() {
  await requireSession();
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="単価申請の作成"
        description="購入単価の登録・改訂を申請します。見積書（PDF/画像）からの自動入力も利用できます。"
      />
      <RequestForm today={todayJST()} />
    </div>
  );
}
