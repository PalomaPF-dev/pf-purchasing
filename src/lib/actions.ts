"use server";

import { revalidatePath } from "next/cache";
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
  upsertLocation,
  updateLocation,
  deleteLocation,
  renumberRequests,
} from "./db";
import { notifyApprovalRequested } from "./approvalNotify";
import type { ApprovalStage, LineInput } from "./types";

/**
 * Server Action の実行結果。
 * Next.js の本番ビルドは Server Action で throw した例外のメッセージを
 * クライアントに渡さない（汎用エラーに置き換わる）ため、
 * 画面に理由を出したい操作は例外ではなく結果として返す。
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "処理に失敗しました。" };
  }
}

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
    // 承認者へLINE WORKS通知（宛先の判定はポータル側。失敗しても申請は成立させる）
    notifyApprovalRequested(s.loginId, id);
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
    notifyApprovalRequested(s.loginId, payload.requestId);
  }
  revalidatePath("/requests");
  revalidatePath(`/requests/${payload.requestId}`);
}

export async function submitRequestAction(requestId: string): Promise<ActionResult> {
  return run(async () => {
    const s = await requireSession();
    await submitRequest(s.companyId, requestId, { loginId: s.loginId, name: s.userName });
    notifyApprovalRequested(s.loginId, requestId);
    revalidatePath("/requests");
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/approvals");
  });
}

/**
 * 申請の取り下げ（承認待ち → 下書き）。申請者本人と管理者のみ。
 * 下書きに戻るので、そのまま修正して再提出、または削除できる。
 */
export async function withdrawRequestAction(
  requestId: string,
  reason: string
): Promise<ActionResult> {
  return run(async () => {
    const s = await requireSession();
    const detail = await getRequest(s.companyId, requestId);
    if (!detail) throw new Error("申請が見つかりません。");
    const mine = detail.request.applicantLoginId && detail.request.applicantLoginId === s.loginId;
    if (!mine && s.role !== "admin") {
      throw new Error("取り下げは申請者本人または管理者のみ実行できます。");
    }
    await withdrawRequest(
      s.companyId,
      requestId,
      { loginId: s.loginId, name: s.userName },
      reason.trim() || null
    );
    revalidatePath("/requests");
    revalidatePath(`/requests/${requestId}`);
    revalidatePath("/approvals");
  });
}

/**
 * 承認の取り消し（管理者のみ）。単価履歴への反映を元に戻して下書きに戻す。
 * MC取込CSV出力済みの場合は force=true が必要。
 */
export async function cancelApprovalAction(
  requestId: string,
  reason: string,
  force: boolean
): Promise<ActionResult<{ removed: number; restored: number }>> {
  return run(async () => {
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
  });
}

/**
 * 下書き（差し戻し含む）の削除。
 * 削除できるのは作成した本人と管理者。成功したら一覧へ戻る。
 * 提出済みは削除できない（取り下げて下書きに戻してから削除する）。
 */
export async function deleteRequestAction(requestId: string): Promise<ActionResult> {
  const s = await requireSession();
  const r = await run(async () => {
    // 電帳法対応: 添付のメタ情報と実体は監査ログ側に残る（deleteRequest 内で書き写す）
    await deleteRequest(s.companyId, requestId, {
      loginId: s.loginId,
      isAdmin: s.role === "admin",
      name: s.userName,
    });
    revalidatePath("/requests");
    revalidatePath(`/requests/${requestId}`);
  });
  return r;
}

/** 既存の申請番号を、現在の採番ルールで振り直す（管理者のみ）。 */
export async function renumberRequestsAction(
  dryRun: boolean
): Promise<ActionResult<{ total: number; changed: number; samples: { before: string; after: string }[] }>> {
  return run(async () => {
    const s = await requireAdminSession();
    const res = await renumberRequests(s.companyId, { dryRun });
    if (!dryRun) {
      revalidatePath("/requests");
      revalidatePath("/approvals");
    }
    return res;
  });
}

/* ===== 納入場所マスタ ===== */

/** 納入場所の追加・更新（同じCDを登録すると上書き）。 */
export async function upsertLocationAction(formData: FormData): Promise<void> {
  const s = await requireAdminSession();
  const code = String(formData.get("code") ?? "").trim();
  if (!code) throw new Error("納入場所CDは必須です");
  await upsertLocation(s.companyId, {
    code,
    name: String(formData.get("name") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  revalidatePath("/locations");
  revalidatePath("/prices");
}

export async function updateLocationAction(
  id: string,
  name: string,
  notes: string,
  active: boolean
): Promise<ActionResult> {
  return run(async () => {
    const s = await requireAdminSession();
    await updateLocation(s.companyId, id, { name, notes: notes.trim() || null, active });
    revalidatePath("/locations");
  });
}

export async function deleteLocationAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const s = await requireAdminSession();
    await deleteLocation(s.companyId, id);
    revalidatePath("/locations");
  });
}

/** 承認（管理者のみ）。stage は現在の申請状態と一致している必要がある。 */
export async function approveRequestAction(
  requestId: string,
  stage: ApprovalStage,
  comment: string
): Promise<ActionResult> {
  return run(async () => {
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
    revalidatePath("/approvals");
    revalidatePath("/prices");
  });
}

/** 差し戻し（管理者のみ） */
export async function rejectRequestAction(
  requestId: string,
  stage: ApprovalStage,
  comment: string
): Promise<ActionResult> {
  return run(async () => {
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
    revalidatePath("/approvals");
  });
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

/** 申請番号の採番ルールの保存（管理者のみ）。 */
export async function saveReqNoSettingsAction(
  format: string,
  reset: "none" | "year" | "month"
): Promise<ActionResult> {
  return run(async () => {
    const s = await requireAdminSession();
    const wf = await getWfSettings(s.companyId);
    await saveWfSettings(s.companyId, {
      ...wf,
      reqFormat: format.trim() || "{YYYY}-{SEQ4}",
      reqReset: reset === "none" || reset === "month" ? reset : "year",
    });
    revalidatePath("/requests");
  });
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
    unitCd: string;
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
    unitCd: nz(item.unitCd),
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
    buyerLoginId: String(formData.get("buyerLoginId") ?? "").trim() || null,
    mgrLoginId: String(formData.get("mgrLoginId") ?? "").trim() || null,
    deptLoginId: String(formData.get("deptLoginId") ?? "").trim() || null,
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
    buyerLoginId: string;
    mgrLoginId: string;
    deptLoginId: string;
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
    buyerLoginId: e.buyerLoginId.trim() || null,
    mgrLoginId: e.mgrLoginId.trim() || null,
    deptLoginId: e.deptLoginId.trim() || null,
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
