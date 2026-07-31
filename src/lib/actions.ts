"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, requireAdminSession } from "./session";
import {
  addRequestMessage,
  approveRequest,
  backfillHistoryNames,
  createRequest,
  deleteItem,
  deleteRequest,
  deleteSupplier,
  rejectRequest,
  submitRequest,
  updateDraftRequest,
  upsertItem,
  upsertSupplier,
} from "./db";
import type { ApprovalStage, LineInput } from "./types";

/* ===== 申請 ===== */

/** フォームJSON（RequestForm から送信）で申請を作成。submit=true なら同時に提出。 */
export async function createRequestAction(payload: {
  title: string | null;
  lines: LineInput[];
  submit: boolean;
}): Promise<{ id: string }> {
  const s = await requireSession();
  const id = await createRequest(
    s.companyId,
    { title: payload.title, lines: payload.lines },
    { loginId: s.loginId, name: s.userName }
  );
  if (payload.submit) {
    await submitRequest(s.companyId, id, { loginId: s.loginId, name: s.userName });
  }
  revalidatePath("/requests");
  return { id };
}

/** 下書き・差し戻し申請の更新。submit=true なら同時に（再）提出。 */
export async function updateRequestAction(payload: {
  requestId: string;
  title: string | null;
  lines: LineInput[];
  submit: boolean;
}): Promise<void> {
  const s = await requireSession();
  await updateDraftRequest(s.companyId, payload.requestId, {
    title: payload.title,
    lines: payload.lines,
  });
  if (payload.submit) {
    await submitRequest(s.companyId, payload.requestId, { loginId: s.loginId, name: s.userName });
  }
  revalidatePath("/requests");
  revalidatePath(`/requests/${payload.requestId}`);
}

export async function submitRequestAction(requestId: string): Promise<void> {
  const s = await requireSession();
  await submitRequest(s.companyId, requestId, { loginId: s.loginId, name: s.userName });
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
}

export async function deleteRequestAction(requestId: string): Promise<void> {
  const s = await requireSession();
  await deleteRequest(s.companyId, requestId);
  revalidatePath("/requests");
  redirect("/requests");
}

/** 承認（管理者のみ）。stage は現在の申請状態と一致している必要がある。 */
export async function approveRequestAction(
  requestId: string,
  stage: ApprovalStage,
  comment: string
): Promise<void> {
  const s = await requireAdminSession();
  await approveRequest(
    s.companyId,
    requestId,
    stage,
    { loginId: s.loginId, name: s.userName },
    comment.trim() || null
  );
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/prices");
}

/** 差し戻し（管理者のみ） */
export async function rejectRequestAction(
  requestId: string,
  stage: ApprovalStage,
  comment: string
): Promise<void> {
  const s = await requireAdminSession();
  await rejectRequest(
    s.companyId,
    requestId,
    stage,
    { loginId: s.loginId, name: s.userName },
    comment.trim() || null
  );
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
}

/** 承認スレッドへのコメント投稿 */
export async function addMessageAction(requestId: string, body: string): Promise<void> {
  const s = await requireSession();
  const text = body.trim();
  if (!text) return;
  await addRequestMessage(s.companyId, requestId, { loginId: s.loginId, name: s.userName }, text);
  revalidatePath(`/requests/${requestId}`);
}

/* ===== マスタ ===== */

export async function upsertItemAction(formData: FormData): Promise<void> {
  const s = await requireAdminSession();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!code) throw new Error("品目CDは必須です");
  await upsertItem(s.companyId, {
    code,
    branch: String(formData.get("branch") ?? "").trim() || null,
    name,
    unitCd: String(formData.get("unitCd") ?? "").trim() || null,
    taxCd: String(formData.get("taxCd") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  revalidatePath("/items");
}

export async function deleteItemAction(id: string): Promise<void> {
  const s = await requireAdminSession();
  await deleteItem(s.companyId, id);
  revalidatePath("/items");
}

export async function upsertSupplierAction(formData: FormData): Promise<void> {
  const s = await requireAdminSession();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!code) throw new Error("発注先CDは必須です");
  await upsertSupplier(s.companyId, {
    code,
    name,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  revalidatePath("/suppliers");
}

export async function deleteSupplierAction(id: string): Promise<void> {
  const s = await requireAdminSession();
  await deleteSupplier(s.companyId, id);
  revalidatePath("/suppliers");
}

/** 履歴の品名・取引先名をマスタから補完（移行後のメンテ） */
export async function backfillNamesAction(): Promise<{ items: number; suppliers: number }> {
  const s = await requireAdminSession();
  const r = await backfillHistoryNames(s.companyId);
  revalidatePath("/prices");
  return r;
}
