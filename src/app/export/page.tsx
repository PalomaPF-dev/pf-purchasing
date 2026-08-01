import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/session";
import { listExportableLines } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import ExportForm from "@/components/ExportForm";

export const dynamic = "force-dynamic";

/** MC取込CSV出力（承認済み明細 → mcframe 購買単価取込フォーマット） */
export default async function ExportPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string; request?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const includeExported = sp.all === "1";
  const requestId = sp.request || null;
  const rows = await listExportableLines(session.companyId, {
    includeExported: includeExported || Boolean(requestId),
    requestId,
  });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      {requestId && (
        <Link
          href={`/requests/${requestId}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#e11d48] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          申請詳細に戻る
        </Link>
      )}
      <PageHeader
        title="MC取込出力"
        description={
          requestId
            ? "この申請の承認済み明細を mcframe の購買単価取込フォーマット（CSV）で出力します。"
            : "承認済みの単価明細を mcframe の購買単価取込フォーマット（CSV）で出力します。1〜2行目はフォーマットのヘッダ、3行目以降がデータです。"
        }
        actions={
          !requestId && (
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
          )
        }
      />

      {/* 出力仕様の明示（既存項目は維持し、単価と適用日だけを更新する） */}
      <div className="mb-4 rounded-xl border border-[#e5e5e5] bg-white p-4 text-sm text-[#555555]">
        <p className="font-bold text-[#333333]">出力される内容</p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs leading-relaxed">
          <li>
            <span className="font-medium text-[#e11d48]">更新される項目</span>: 適用開始日 /
            適用終了日 / 単価 / 改訂前単価
          </li>
          <li>
            <span className="font-medium">維持される項目</span>:
            枝番・品名・単位ＣＤ・ロット数・通貨ＣＤ・納入場所ＣＤ・納品先ＣＤ・
            ワーキンググループＣＤ・仕入税ＣＤ・メモは、mcframe の現行登録値（単価履歴）を
            そのまま出力します。申請で明示的に入力した場合のみ、その値で上書きされます。
          </li>
          <li>
            名称のみの列（ワーキンググループ名・単位名・通貨名・仕入税名・品目区分など）は
            mcframe 側のマスタ参照項目のため、フォーマットの見本と同じく空欄で出力します。
          </li>
        </ul>
      </div>

      <ExportForm rows={rows} />
    </div>
  );
}
