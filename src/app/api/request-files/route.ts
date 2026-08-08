import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session";
import {
  addRequestFile,
  deleteRequestFile,
  getRequest,
  listRequestFiles,
  requestIdOfFile,
} from "@/lib/db";
import { canAccessRequest } from "@/lib/requestAccess";
import { deletePrivateBlob, isPrivateBlobConfigured, putRequestFile } from "@/lib/privateBlob";

export const runtime = "nodejs";

/**
 * 1ファイルの上限。
 * 実体は Private Blob に置くが、アップロードはこの Route を経由するため
 * Vercel Functions のリクエストボディ上限（4.5MB）が効く。安全側で 4MB とする。
 */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * 申請の添付資料（見積書・仕様書など）。
 * - GET    ?requestId=... … 添付一覧
 * - POST   multipart（requestId, file[]） … アップロード
 * - DELETE ?id=...        … 削除（下書き・差し戻し中のみ）
 */
export async function GET(req: Request) {
  const session = await getSessionWithRole();
  if (!session?.companyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const requestId = new URL(req.url).searchParams.get("requestId") ?? "";
  if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  if (!(await canAccessRequest(session, requestId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ files: await listRequestFiles(session.companyId, requestId) });
}

export async function POST(req: Request) {
  const session = await getSessionWithRole();
  if (!session?.companyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const requestId = String(form.get("requestId") ?? "").trim();
  if (!requestId) return NextResponse.json({ error: "requestId is required" }, { status: 400 });

  const detail = await getRequest(session.companyId, requestId);
  if (!detail) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
  if (!(await canAccessRequest(session, requestId, detail.request.applicantLoginId))) {
    return NextResponse.json({ error: "この申請の添付は操作できません" }, { status: 403 });
  }

  const kind = String(form.get("kind") ?? "quote");
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "ファイルを選択してください" }, { status: 400 });
  }
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `「${f.name}」が大きすぎます（1ファイル4MBまで）。分割するかPDFを圧縮してください。` },
        { status: 413 }
      );
    }
  }
  // 実体は Private Blob へ。トークン未設定の環境（オンプレ等）では従来どおり DB に入れる。
  const useBlob = isPrivateBlobConfigured();
  // DB 登録前に Blob へ上げるので、途中で失敗したら参照されない実体が残る。
  // それを消せるように、成功した URL を控えておく。
  const uploaded: string[] = [];
  try {
    for (const f of files) {
      const body = Buffer.from(await f.arrayBuffer());
      const contentType = f.type || "application/octet-stream";
      let blobUrl: string | null = null;
      if (useBlob) {
        blobUrl = await putRequestFile({
          companyId: session.companyId,
          requestId,
          fileName: f.name,
          contentType,
          body,
        });
        uploaded.push(blobUrl);
      }
      await addRequestFile(session.companyId, requestId, {
        fileName: f.name,
        contentType,
        blobUrl,
        data: blobUrl ? null : body,
        sizeBytes: body.length,
        kind,
        uploadedBy: session.loginId,
        uploadedName: session.userName,
      });
    }
  } catch (e) {
    console.error("[request-files] upload", e);
    // DB に紐づかなかった実体を後始末する（残しても害はないが課金と混乱の元）
    await Promise.all(uploaded.map((u) => deletePrivateBlob(u)));
    return NextResponse.json({ error: "添付の保存に失敗しました" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    count: files.length,
    files: await listRequestFiles(session.companyId, requestId),
  });
}

export async function DELETE(req: Request) {
  const session = await getSessionWithRole();
  if (!session?.companyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const reason = url.searchParams.get("reason")?.trim() || null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const requestId = await requestIdOfFile(session.companyId, id);
  if (!requestId) return NextResponse.json({ error: "添付が見つかりません" }, { status: 404 });
  const detail = await getRequest(session.companyId, requestId);
  if (!detail) return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
  if (!(await canAccessRequest(session, requestId, detail.request.applicantLoginId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // 承認へ回った後の添付は記録として残す（下書き・差し戻し中のみ削除可）
  const st = detail.request.status;
  if (!(st === "draft" || st === "rejected") && session.role !== "admin") {
    return NextResponse.json(
      { error: "提出後の添付は削除できません（管理者にご依頼ください）" },
      { status: 409 }
    );
  }
  // 電帳法対応: 物理削除はしない。行と実体を残したまま論理削除し、履歴を記録する
  await deleteRequestFile(
    session.companyId,
    id,
    { loginId: session.loginId, name: session.userName },
    reason
  );
  return NextResponse.json({ ok: true, files: await listRequestFiles(session.companyId, requestId) });
}
