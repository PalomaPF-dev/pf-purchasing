"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, requireAdminSession, supplierScopeOf } from "./session";
import {
  addRequestMessage,
  approveRequest,
  cancelApproval,
  getRequest,
  withdrawRequest,
  backfillHistoryNames,
  canAccessSupplier,
  createRequest,
  deleteItem,
  deleteRequest,
  deleteSupplier,
  rejectRequest,
  submitRequest,
  updateDraftRequest,
  saveWfSettings,
  getWfSettings,
  setSupplierContactIds,
  upsertItem,
  updateItem,
  upsertSupplier,
  upsertEmployee,
  updateEmployee,
  deleteEmployee,
  syncUsersFromEmployees,
} from "./db";
import type { ApprovalStage, LineInput } from "./types";

/**
 * 明細の取引先がログイン中ユーザーの担当かをサーバー側で検証する。
 * 一般（バイヤー）は担当外の取引先に申請できない（UIでも選べないが必ず防ぐ）。
 */
async function assertSupplierAllowed(
  s: { companyId: string; role: "admin" | "member"; loginId: string | null },
  lines: LineInput[]
): Promise<void> {
  const scope = supplierScopeOf(s);
  if (!scope.restricted) return;
  const codes = [...new Set(lines.map((l) => (l.supplierCd ?? "").trim()).filter(Boolean))];
  for (const code of codes) {
    if (!(await canAccessSupplier(s.companyId, code, scope.buyerLoginId))) {
      throw new Error(`取引先 ${code} はあなたの担当ではありません。担当の取引先のみ申請できます。`);
    }
  }
}

/* ===== 申請 ===== */

/** フォームJSON（RequestForm から送信）で申請を作成。submit=true なら同時に提出。 */
export async function createRequestAction(payload: {
  title: string | null;
  lines: LineInput[];
  submit: boolean;
}): Promise<{ id: string }> {
  const s = await requireSession();
  await assertSupplierAllowed(s, payload.lines);
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
  await assertSupplierAllowed(s, payload.lines);
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

/**
 * 申請の取り下げ（承認待ち → 下書き）。申請者本人と管理者のみ。
 * 下書きに戻るので、そのまま修正して再提出、または削除できる。
 */
export async function withdrawRequestAction(requestId: string, reason: string): Promise<void> {
  const s = await requireSession();
  const detail = await getRequest(s.companyId, requestId);
  if (!detail) throw new Error("申請が見つかりません。");
  const mine = detail.request.applicantLoginId && detail.request.applicantLoginId === s.loginId;
  if (!mine && s.role !== "admin") {
    throw new Error("取り下げは申請者本人または管理者のみ実行できます。");
  }
  await withdrawRequest(s.companyId, requestId, { loginId: s.loginId, name: s.userName }, reason.trim() || null);
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/approvals");
}

/**
 * 承認の取り消し（管理者のみ）。単価履歴への反映を元に戻して下書きに戻す。
 * MC取込CSV出力済みの場合は force=true が必要。
 */
export async function cancelApprovalAction(
  requestId: string,
  reason: string,
  force: boolean
): Promise<{ removed: number; restored: number }> {
  const s = await requireAdminSession();
  const r = await cancelApproval(s.companyId, requestId, { loginId: s.loginId, name: s.userName }, {
    reason: reason.trim() || null,
    force,
  });
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/prices");
  revalidatePath("/export");
  return r;
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

/**
 * 一括承認（管理者のみ）。選択した申請をまとめて承認する。
 * 1件ごとに処理し、失敗した申請は理由つきで返す（成功分はそのまま確定）。
 */
export async function approveManyAction(
  requestIds: string[],
  stage: ApprovalStage,
  comment: string
): Promise<{ ok: number; failed: { id: string; message: string }[] }> {
  const s = await requireAdminSession();
  const failed: { id: string; message: string }[] = [];
  let ok = 0;
  for (const id of requestIds) {
    try {
      await approveRequest(
        s.companyId,
        id,
        stage,
        { loginId: s.loginId, name: s.userName },
        comment.trim() || null
      );
      ok++;
    } catch (e) {
      failed.push({ id, message: e instanceof Error ? e.message : "承認に失敗しました" });
    }
  }
  revalidatePath("/approvals");
  revalidatePath("/requests");
  revalidatePath("/prices");
  return { ok, failed };
}

/** 一括差し戻し（管理者のみ）。理由は必須。 */
export async function rejectManyAction(
  requestIds: string[],
  stage: ApprovalStage,
  comment: string
): Promise<{ ok: number; failed: { id: string; message: string }[] }> {
  const s = await requireAdminSession();
  if (!comment.trim()) throw new Error("差し戻しの理由を入力してください。");
  const failed: { id: string; message: string }[] = [];
  let ok = 0;
  for (const id of requestIds) {
    try {
      await rejectRequest(s.companyId, id, stage, { loginId: s.loginId, name: s.userName }, comment.trim());
      ok++;
    } catch (e) {
      failed.push({ id, message: e instanceof Error ? e.message : "差し戻しに失敗しました" });
    }
  }
  revalidatePath("/approvals");
  revalidatePath("/requests");
  return { ok, failed };
}

/** 承認段階の名称の保存（管理者のみ）。承認者はユーザー登録側で管理する。 */
export async function saveWfLabelsAction(mgrLabel: string, deptLabel: string): Promise<void> {
  const s = await requireAdminSession();
  const wf = await getWfSettings(s.companyId);
  await saveWfSettings(s.companyId, {
    ...wf,
    mgrLabel: mgrLabel.trim() || "MGR",
    deptLabel: deptLabel.trim() || "部門長",
  });
  revalidatePath("/employees");
  revalidatePath("/approvals");
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
  const fs = (k: string) => String(formData.get(k) ?? "").trim() || null;
  await upsertItem(s.companyId, {
    code,
    branch: fs("branch"),
    name,
    unitCd: fs("unitCd"),
    taxCd: fs("taxCd"),
    notes: fs("notes"),
    acctCd: fs("acctCd"),
    acctName: fs("acctName"),
    acctDetail: fs("acctDetail"),
    icsName: fs("icsName"),
    itemClass: fs("itemClass"),
    materialClass: fs("materialClass"),
  });
  revalidatePath("/items");
}

/** 登録済み品番の編集（管理者のみ）。品目CD・枝番は変更できない。 */
export async function updateItemAction(
  id: string,
  item: {
    name: string;
    notes: string;
    acctCd: string;
    acctName: string;
    acctDetail: string;
    icsName: string;
    itemClass: string;
    materialClass: string;
    active: boolean;
  }
): Promise<void> {
  const s = await requireAdminSession();
  if (!item.name.trim()) throw new Error("品名は必須です");
  const nz = (v: string) => v.trim() || null;
  await updateItem(s.companyId, id, {
    name: item.name,
    notes: nz(item.notes),
    acctCd: nz(item.acctCd),
    acctName: nz(item.acctName),
    acctDetail: nz(item.acctDetail),
    icsName: nz(item.icsName),
    itemClass: nz(item.itemClass),
    materialClass: nz(item.materialClass),
    active: item.active,
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
  if (!code) throw new Error("取引先CDは必須です");
  await upsertSupplier(s.companyId, {
    code,
    name,
    notes: String(formData.get("notes") ?? "").trim() || null,
    buyerLoginId: String(formData.get("buyerLoginId") ?? "").trim() || null,
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

/* ---------------- 社員マスタ ---------------- */

export async function upsertEmployeeAction(formData: FormData): Promise<void> {
  const s = await requireAdminSession();
  const loginId = String(formData.get("loginId") ?? "").trim();
  if (!loginId) throw new Error("社員番号は必須です");
  const wf = String(formData.get("wfRole") ?? "");
  await upsertEmployee(s.companyId, {
    loginId,
    name: String(formData.get("name") ?? "").trim(),
    wfRole: wf === "mgr" || wf === "dept" ? wf : null,
    role: String(formData.get("role") ?? "") === "admin" ? "admin" : "member",
    email: String(formData.get("email") ?? "").trim() || null,
  });
  revalidatePath("/employees");
  revalidatePath("/employees");
}

/** 登録済み社員の編集（管理者のみ）。社員番号は変更できない。 */
export async function updateEmployeeAction(
  id: string,
  e: {
    name: string;
    wfRole: "mgr" | "dept" | null;
    role: "admin" | "member";
    email: string;
    active: boolean;
  }
): Promise<void> {
  const s = await requireAdminSession();
  if (!e.name.trim()) throw new Error("氏名は必須です");
  await updateEmployee(s.companyId, id, {
    name: e.name,
    wfRole: e.wfRole,
    role: e.role,
    email: e.email.trim() || null,
    active: e.active,
  });
  revalidatePath("/employees");
  revalidatePath("/employees");
}

export async function deleteEmployeeAction(id: string): Promise<void> {
  const s = await requireAdminSession();
  await deleteEmployee(s.companyId, id);
  revalidatePath("/employees");
  revalidatePath("/employees");
}

/**
 * 社員マスタからログインユーザーを登録・更新し、承認W/Fの承認者も合わせて設定する。
 * 既存ユーザーは氏名・権限のみ更新（パスワードは変更しない）。
 */
export async function syncUsersAction(): Promise<{
  created: number;
  updated: number;
  mgr: number;
  dept: number;
}> {
  const s = await requireAdminSession();
  const r = await syncUsersFromEmployees(s.companyId);
  revalidatePath("/employees");
  return { created: r.created, updated: r.updated, mgr: r.mgr.length, dept: r.dept.length };
}

/** 取引先の担当窓口（企画グループ・管理グループ）の設定（管理者のみ） */
export async function setSupplierContactsAction(
  id: string,
  contacts: { buyerLoginId: string; buyerSubLoginId: string; chaserLoginId: string }
): Promise<void> {
  const s = await requireAdminSession();
  await setSupplierContactIds(s.companyId, id, {
    buyerLoginId: contacts.buyerLoginId.trim() || null,
    buyerSubLoginId: contacts.buyerSubLoginId.trim() || null,
    chaserLoginId: contacts.chaserLoginId.trim() || null,
  });
  revalidatePath("/suppliers");
}
