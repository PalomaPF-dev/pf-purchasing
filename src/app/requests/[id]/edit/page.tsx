import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getRequest } from "@/lib/db";
import { todayJST } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import RequestForm from "@/components/RequestForm";

export const dynamic = "force-dynamic";

/** 下書き・差し戻し申請の編集 */
export default async function EditRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const detail = await getRequest(session.companyId, id);
  if (!detail) notFound();
  if (detail.request.status !== "draft" && detail.request.status !== "rejected") {
    redirect(`/requests/${id}`);
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link
        href={`/requests/${id}`}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#2563eb] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        申請詳細に戻る
      </Link>
      <PageHeader
        title={`単価申請の編集 ${detail.request.reqNo != null ? `#${detail.request.reqNo}` : "（下書き）"}`}
        description="内容を修正して保存、または再提出します。"
      />
      <RequestForm
        requestId={id}
        initialTitle={detail.request.title}
        initialLines={detail.lines}
        today={todayJST()}
      />
    </div>
  );
}
