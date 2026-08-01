import { getSql } from "./neon";
import { ensureSchema } from "./schema";
import { createInvitedUser } from "./authDb";
import type {
  ApprovalStage,
  Item,
  LineInput,
  PriceHistoryRow,
  PriceRequest,
  PriceRequestLine,
  RequestApproval,
  RequestMessage,
  RequestStatus,
  Supplier,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ===== 行マッピング =====

function dateStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function tsStr(v: unknown): string {
  if (v == null) return "";
  return v instanceof Date ? v.toISOString() : String(v);
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapRequest(r: any): PriceRequest {
  return {
    id: r.id,
    reqNo: r.req_no ?? null,
    reqCode: r.req_code ?? (r.req_no != null ? `#${r.req_no}` : null),
    title: r.title ?? null,
    status: r.status as RequestStatus,
    applicantLoginId: r.applicant_login_id ?? null,
    applicantName: r.applicant_name ?? null,
    submittedAt: r.submitted_at ? tsStr(r.submitted_at) : null,
    createdAt: tsStr(r.created_at),
    lineCount: r.line_count != null ? Number(r.line_count) : undefined,
    supplierSummary: r.supplier_summary ?? null,
  };
}

function mapLine(r: any): PriceRequestLine {
  return {
    id: r.id,
    requestId: r.request_id,
    seq: Number(r.seq),
    itemCd: r.item_cd,
    itemBranch: r.item_branch ?? null,
    itemName: r.item_name ?? null,
    supplierCd: r.supplier_cd,
    supplierName: r.supplier_name ?? null,
    locCd: r.loc_cd ?? null,
    locName: r.loc_name ?? null,
    dlvCd: r.dlv_cd ?? null,
    dlvName: r.dlv_name ?? null,
    unitCd: r.unit_cd ?? null,
    lotQty: num(r.lot_qty),
    currency: r.currency ?? null,
    startDate: dateStr(r.start_date),
    endDate: r.end_date ? dateStr(r.end_date) : null,
    currentPrice: num(r.current_price),
    newPrice: Number(r.new_price),
    paidSupplyPrice: num(r.paid_supply_price),
    monthlyQty: num(r.monthly_qty),
    bdSupplyMat: num(r.bd_supply_mat),
    bdMaterial: num(r.bd_material),
    bdRevision: num(r.bd_revision),
    bdDesign: num(r.bd_design),
    bdForex: num(r.bd_forex),
    bdOther: num(r.bd_other),
    reasonNote: r.reason_note ?? null,
    taxCd: r.tax_cd ?? null,
    wgCd: r.wg_cd ?? null,
    exportedAt: r.exported_at ? tsStr(r.exported_at) : null,
  };
}

function mapHistory(r: any): PriceHistoryRow {
  return {
    id: r.id,
    itemCd: r.item_cd,
    itemBranch: r.item_branch ?? null,
    itemName: r.item_name ?? null,
    supplierCd: r.supplier_cd,
    supplierName: r.supplier_name ?? null,
    unitCd: r.unit_cd ?? null,
    lotQty: num(r.lot_qty),
    currency: r.currency ?? null,
    locCd: r.loc_cd ?? null,
    dlvCd: r.dlv_cd ?? null,
    wgCd: r.wg_cd ?? null,
    startDate: dateStr(r.start_date),
    endDate: r.end_date ? dateStr(r.end_date) : null,
    price: Number(r.price),
    priceBefore: num(r.price_before),
    taxCd: r.tax_cd ?? null,
    monthlyQty: num(r.monthly_qty),
    reason: r.reason ?? null,
    bdSupplyMat: num(r.bd_supply_mat),
    bdMaterial: num(r.bd_material),
    bdRevision: num(r.bd_revision),
    bdDesign: num(r.bd_design),
    bdForex: num(r.bd_forex),
    bdOther: num(r.bd_other),
    reqNo: r.req_no != null ? Number(r.req_no) : null,
    applicantName: r.applicant_name ?? null,
    approvedAt: r.approved_at ? tsStr(r.approved_at) : null,
    source: (r.source ?? "approval") as "migration" | "approval",
    requestLineId: r.request_line_id ?? null,
    createdAt: tsStr(r.created_at),
  };
}

// ===== ダッシュボード =====

export async function dashboardStats(companyId: string): Promise<{
  pendingCount: number;
  mgrApprovedCount: number;
  draftCount: number;
  approvedThisMonth: number;
  itemCount: number;
  supplierCount: number;
  historyCount: number;
  unexportedCount: number;
}> {
  await ensureSchema();
  const sql = getSql();
  const [reqs, items, suppliers, history, unexported] = await Promise.all([
    sql`
      SELECT status, COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE status = 'approved'
               AND date_trunc('month', updated_at) = date_trunc('month', NOW()))::int AS n_month
      FROM price_requests WHERE company_id = ${companyId}
      GROUP BY status`,
    sql`SELECT COUNT(*)::int AS n FROM items WHERE company_id = ${companyId} AND active`,
    sql`SELECT COUNT(*)::int AS n FROM suppliers WHERE company_id = ${companyId} AND active`,
    sql`SELECT COUNT(*)::int AS n FROM price_history WHERE company_id = ${companyId}`,
    sql`
      SELECT COUNT(*)::int AS n
      FROM price_request_lines l
      JOIN price_requests r ON r.id = l.request_id
      WHERE l.company_id = ${companyId} AND r.status = 'approved' AND l.exported_at IS NULL`,
  ]);
  const by: Record<string, { n: number; nMonth: number }> = {};
  for (const r of reqs as any[]) by[r.status] = { n: Number(r.n), nMonth: Number(r.n_month) };
  return {
    pendingCount: by.pending?.n ?? 0,
    mgrApprovedCount: by.mgr_approved?.n ?? 0,
    draftCount: by.draft?.n ?? 0,
    approvedThisMonth: by.approved?.nMonth ?? 0,
    itemCount: Number((items as any)[0]?.n ?? 0),
    supplierCount: Number((suppliers as any)[0]?.n ?? 0),
    historyCount: Number((history as any)[0]?.n ?? 0),
    unexportedCount: Number((unexported as any)[0]?.n ?? 0),
  };
}

// ===== 申請 =====

export async function listRequests(
  companyId: string,
  opts: {
    status?: RequestStatus | "awaiting" | null;
    applicantLoginId?: string | null;
    /** 指定時、その担当バイヤーの取引先を含む申請のみ返す */
    buyerLoginId?: string | null;
    q?: string | null;
    limit?: number;
  } = {}
): Promise<PriceRequest[]> {
  await ensureSchema();
  const sql = getSql();
  const limit = Math.min(opts.limit ?? 200, 500);
  const q = opts.q ? `%${opts.q}%` : null;
  // awaiting = 承認作業対象（MGR承認待ち＋部門長承認待ち）
  const statuses =
    opts.status === "awaiting" ? ["pending", "mgr_approved"] : opts.status ? [opts.status] : null;
  const rows = await sql`
    SELECT r.*,
      (SELECT COUNT(*)::int FROM price_request_lines l WHERE l.request_id = r.id) AS line_count,
      (SELECT MIN(l.supplier_cd || ' ' || COALESCE(l.supplier_name, ''))
         FROM price_request_lines l WHERE l.request_id = r.id) AS supplier_summary
    FROM price_requests r
    WHERE r.company_id = ${companyId}
      AND (${statuses}::text[] IS NULL OR r.status = ANY(${statuses}))
      AND (${opts.applicantLoginId ?? null}::text IS NULL OR r.applicant_login_id = ${opts.applicantLoginId ?? null})
      AND (${opts.buyerLoginId ?? null}::text IS NULL OR EXISTS (
        SELECT 1 FROM price_request_lines l2
        JOIN suppliers sp ON sp.company_id = l2.company_id AND sp.code = l2.supplier_cd
        WHERE l2.request_id = r.id
          AND ${opts.buyerLoginId ?? null} IN (sp.buyer_login_id, sp.buyer_sub_login_id, sp.chaser_login_id)
      ))
      AND (${q}::text IS NULL OR EXISTS (
        SELECT 1 FROM price_request_lines l
        WHERE l.request_id = r.id
          AND (l.item_cd ILIKE ${q} OR l.item_name ILIKE ${q}
               OR l.supplier_cd ILIKE ${q} OR l.supplier_name ILIKE ${q})
      ) OR r.title ILIKE ${q})
    ORDER BY r.created_at DESC
    LIMIT ${limit}`;
  return (rows as any[]).map(mapRequest);
}

export interface RequestDetail {
  request: PriceRequest;
  lines: PriceRequestLine[];
  approvals: RequestApproval[];
  messages: RequestMessage[];
}

export async function getRequest(companyId: string, id: string): Promise<RequestDetail | null> {
  await ensureSchema();
  const sql = getSql();
  const [reqRows, lineRows, apprRows, msgRows] = await Promise.all([
    sql`SELECT * FROM price_requests WHERE company_id = ${companyId} AND id = ${id} LIMIT 1`,
    sql`SELECT * FROM price_request_lines WHERE company_id = ${companyId} AND request_id = ${id} ORDER BY seq`,
    sql`SELECT * FROM request_approvals WHERE company_id = ${companyId} AND request_id = ${id} ORDER BY created_at`,
    sql`SELECT * FROM request_messages WHERE company_id = ${companyId} AND request_id = ${id} ORDER BY created_at`,
  ]);
  const req = (reqRows as any[])[0];
  if (!req) return null;
  return {
    request: mapRequest(req),
    lines: (lineRows as any[]).map(mapLine),
    approvals: (apprRows as any[]).map((r) => ({
      id: r.id,
      stage: r.stage as ApprovalStage,
      action: r.action as "approve" | "reject",
      approverLoginId: r.approver_login_id ?? null,
      approverName: r.approver_name ?? null,
      comment: r.comment ?? null,
      createdAt: tsStr(r.created_at),
    })),
    messages: (msgRows as any[]).map((r) => ({
      id: r.id,
      authorLoginId: r.author_login_id ?? null,
      authorName: r.author_name ?? null,
      body: r.body,
      isSystem: Boolean(r.is_system),
      createdAt: tsStr(r.created_at),
    })),
  };
}

function normLine(l: LineInput): LineInput {
  const s = (v: unknown): string | null => {
    const t = typeof v === "string" ? v.trim() : "";
    return t === "" ? null : t;
  };
  return {
    ...l,
    itemCd: (l.itemCd ?? "").trim(),
    itemBranch: s(l.itemBranch),
    itemName: s(l.itemName),
    supplierCd: (l.supplierCd ?? "").trim(),
    supplierName: s(l.supplierName),
    locCd: s(l.locCd),
    locName: s(l.locName),
    dlvCd: s(l.dlvCd),
    dlvName: s(l.dlvName),
    unitCd: s(l.unitCd),
    currency: s(l.currency) ?? "JPY",
    endDate: s(l.endDate) ?? "2099-12-31",
    reasonNote: s(l.reasonNote),
    taxCd: s(l.taxCd) ?? "P0010",
    wgCd: s(l.wgCd) ?? "WG00",
  };
}

/** 申請を作成（明細つき・下書き）。作成した申請IDを返す。 */
export async function createRequest(
  companyId: string,
  data: { title: string | null; lines: LineInput[] },
  applicant: { loginId: string | null; name: string }
): Promise<string> {
  await ensureSchema();
  if (data.lines.length === 0) throw new Error("明細が1件もありません");
  const sql = getSql();
  const reqRows = await sql`
    INSERT INTO price_requests (company_id, title, status, applicant_login_id, applicant_name)
    VALUES (${companyId}, ${data.title}, 'draft', ${applicant.loginId}, ${applicant.name})
    RETURNING id`;
  const requestId = (reqRows as any)[0].id as string;
  await insertLines(companyId, requestId, data.lines);
  return requestId;
}

async function insertLines(companyId: string, requestId: string, lines: LineInput[]): Promise<void> {
  const sql = getSql();
  const payload = lines.map(normLine).map((l, i) => {
    if (!l.itemCd) throw new Error(`明細${i + 1}: 品目CDは必須です`);
    if (!l.supplierCd) throw new Error(`明細${i + 1}: 取引先CDは必須です`);
    if (!l.startDate) throw new Error(`明細${i + 1}: 適用開始日は必須です`);
    if (l.newPrice == null || !Number.isFinite(l.newPrice))
      throw new Error(`明細${i + 1}: 購入単価は数値で入力してください`);
    return {
      seq: i + 1,
      item_cd: l.itemCd,
      item_branch: l.itemBranch,
      item_name: l.itemName,
      supplier_cd: l.supplierCd,
      supplier_name: l.supplierName,
      loc_cd: l.locCd,
      loc_name: l.locName,
      dlv_cd: l.dlvCd,
      dlv_name: l.dlvName,
      unit_cd: l.unitCd,
      lot_qty: l.lotQty ?? null,
      currency: l.currency,
      start_date: l.startDate,
      end_date: l.endDate,
      current_price: l.currentPrice ?? null,
      new_price: l.newPrice,
      paid_supply_price: l.paidSupplyPrice ?? null,
      monthly_qty: l.monthlyQty ?? null,
      bd_supply_mat: l.bdSupplyMat ?? null,
      bd_material: l.bdMaterial ?? null,
      bd_revision: l.bdRevision ?? null,
      bd_design: l.bdDesign ?? null,
      bd_forex: l.bdForex ?? null,
      bd_other: l.bdOther ?? null,
      reason_note: l.reasonNote,
      tax_cd: l.taxCd,
      wg_cd: l.wgCd,
    };
  });
  await sql`
    INSERT INTO price_request_lines (
      company_id, request_id, seq, item_cd, item_branch, item_name,
      supplier_cd, supplier_name, loc_cd, loc_name, dlv_cd, dlv_name,
      unit_cd, lot_qty, currency, start_date, end_date,
      current_price, new_price, paid_supply_price, monthly_qty,
      bd_supply_mat, bd_material, bd_revision, bd_design, bd_forex, bd_other,
      reason_note, tax_cd, wg_cd
    )
    SELECT ${companyId}::uuid, ${requestId}::uuid, x.seq, x.item_cd, x.item_branch, x.item_name,
           x.supplier_cd, x.supplier_name, x.loc_cd, x.loc_name, x.dlv_cd, x.dlv_name,
           x.unit_cd, x.lot_qty, x.currency, x.start_date::date, x.end_date::date,
           x.current_price, x.new_price, x.paid_supply_price, x.monthly_qty,
           x.bd_supply_mat, x.bd_material, x.bd_revision, x.bd_design, x.bd_forex, x.bd_other,
           x.reason_note, x.tax_cd, x.wg_cd
    FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS x(
      seq int, item_cd text, item_branch text, item_name text,
      supplier_cd text, supplier_name text, loc_cd text, loc_name text, dlv_cd text, dlv_name text,
      unit_cd text, lot_qty double precision, currency text, start_date text, end_date text,
      current_price double precision, new_price double precision, paid_supply_price double precision,
      monthly_qty double precision,
      bd_supply_mat double precision, bd_material double precision, bd_revision double precision,
      bd_design double precision, bd_forex double precision, bd_other double precision,
      reason_note text, tax_cd text, wg_cd text
    )`;
}

/** 下書きの明細を全置換で更新（タイトルも）。下書き以外は不可。 */
export async function updateDraftRequest(
  companyId: string,
  requestId: string,
  data: { title: string | null; lines: LineInput[] }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT status FROM price_requests WHERE company_id = ${companyId} AND id = ${requestId} LIMIT 1`;
  const status = (rows as any)[0]?.status;
  if (!status) throw new Error("申請が見つかりません");
  if (status !== "draft" && status !== "rejected") throw new Error("下書き・差し戻しのみ編集できます");
  await sql`
    UPDATE price_requests SET title = ${data.title}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${requestId}`;
  await sql`DELETE FROM price_request_lines WHERE company_id = ${companyId} AND request_id = ${requestId}`;
  await insertLines(companyId, requestId, data.lines);
}

export async function deleteRequest(companyId: string, requestId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    DELETE FROM price_requests
    WHERE company_id = ${companyId} AND id = ${requestId} AND status IN ('draft', 'rejected')`;
}

/** 申請を提出（draft/rejected → pending）。申請番号を採番する。 */
export async function submitRequest(
  companyId: string,
  requestId: string,
  actor: { loginId: string | null; name: string }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const cur = (await sql`
    SELECT status, req_no FROM price_requests
    WHERE company_id = ${companyId} AND id = ${requestId} LIMIT 1`) as any[];
  if (cur.length === 0) throw new Error("申請が見つかりません");
  if (cur[0].status !== "draft" && cur[0].status !== "rejected")
    throw new Error("提出できませんでした（状態を確認してください）");

  // 採番は初回提出時のみ。取り下げ→再提出では番号を維持する
  let reqNo: number | null = cur[0].req_no ?? null;
  let reqSeq: number | null = null;
  let reqCode: string | null = null;
  if (reqNo == null) {
    const wf = await getWfSettings(companyId);
    const now = new Date();
    // 連番のリセット単位に応じて、その期間内の最大値の次を採番する
    const since =
      wf.reqReset === "month"
        ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
        : wf.reqReset === "year"
          ? `${now.getFullYear()}-01-01`
          : null;
    const seqRow = (await sql`
      SELECT COALESCE(MAX(req_seq), 0) + 1 AS n FROM price_requests
      WHERE company_id = ${companyId}
        AND (${since}::date IS NULL OR submitted_at >= ${since}::date)`) as any[];
    reqSeq = Number(seqRow[0]?.n ?? 1);
    reqCode = formatReqCode(wf.reqFormat, reqSeq, now);
    const noRow = (await sql`
      SELECT COALESCE(MAX(req_no), 0) + 1 AS n FROM price_requests
      WHERE company_id = ${companyId}`) as any[];
    reqNo = Number(noRow[0]?.n ?? 1);
  }

  const rows = await sql`
    UPDATE price_requests SET
      status = 'pending',
      submitted_at = NOW(),
      updated_at = NOW(),
      applicant_login_id = COALESCE(applicant_login_id, ${actor.loginId}),
      applicant_name = COALESCE(applicant_name, ${actor.name}),
      req_no = COALESCE(req_no, ${reqNo}),
      req_seq = COALESCE(req_seq, ${reqSeq}),
      req_code = COALESCE(req_code, ${reqCode})
    WHERE company_id = ${companyId} AND id = ${requestId} AND status IN ('draft', 'rejected')
    RETURNING id`;
  if ((rows as any[]).length === 0) throw new Error("提出できませんでした（状態を確認してください）");
  await addRequestMessage(companyId, requestId, actor, "申請を提出しました。", true);
}

/**
 * 申請の取り下げ（pending / mgr_approved → draft）。
 * 申請者本人と管理者が実行でき、下書きに戻して修正・再提出または削除できる。
 * 申請Noは維持する（同じ申請の続きとして扱う）。
 */
export async function withdrawRequest(
  companyId: string,
  requestId: string,
  actor: { loginId: string | null; name: string },
  reason: string | null
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE price_requests SET status = 'draft', updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${requestId}
      AND status IN ('pending', 'mgr_approved')
    RETURNING id`;
  if ((rows as any[]).length === 0)
    throw new Error("取り下げできませんでした（既に承認済みか、下書きに戻っています）。");
  await addRequestMessage(
    companyId,
    requestId,
    actor,
    `申請を取り下げて下書きに戻しました。${reason ? `（理由: ${reason}）` : ""}`,
    true
  );
}

/**
 * 承認の取り消し（approved → draft）。管理者のみ。
 * 単価履歴に反映済みの行を削除し、その改訂で適用終了にした直前の行を元に戻す
 * （直前行の適用終了日は、取り消す行が引き継いでいた終了日に復元する）。
 * MC取込CSV出力済みの明細は mcframe 側と不整合になるため、既定では取り消さない。
 */
export async function cancelApproval(
  companyId: string,
  requestId: string,
  actor: { loginId: string | null; name: string },
  opts: { reason: string | null; force?: boolean }
): Promise<{ removed: number; restored: number }> {
  await ensureSchema();
  const sql = getSql();
  const cur = (await sql`
    SELECT status FROM price_requests
    WHERE company_id = ${companyId} AND id = ${requestId} LIMIT 1`) as any[];
  if (cur.length === 0) throw new Error("申請が見つかりません。");
  if (cur[0].status !== "approved") throw new Error("承認済みの申請のみ取り消せます。");

  const exported = (await sql`
    SELECT COUNT(*)::int AS n FROM price_request_lines
    WHERE company_id = ${companyId} AND request_id = ${requestId} AND exported_at IS NOT NULL`) as any[];
  if (Number(exported[0]?.n ?? 0) > 0 && !opts.force) {
    throw new Error(
      "この申請はMC取込CSVに出力済みです。mcframe 側の単価も戻す必要があるため、確認のうえ「出力済みでも取り消す」を選択してください。"
    );
  }

  // 取り消す履歴行（この申請の明細から作られた行）
  const target = (await sql`
    SELECT h.id, h.item_cd, h.item_branch, h.supplier_cd, h.loc_cd, h.dlv_cd, h.start_date, h.end_date
    FROM price_history h
    JOIN price_request_lines l ON l.id = h.request_line_id
    WHERE h.company_id = ${companyId} AND l.request_id = ${requestId}`) as any[];

  let restored = 0;
  for (const h of target) {
    // この改訂で適用終了にした直前の行を、元の適用終了日に戻す
    const res = (await sql`
      UPDATE price_history SET end_date = ${h.end_date}
      WHERE company_id = ${companyId}
        AND id <> ${h.id}
        AND item_cd = ${h.item_cd}
        AND COALESCE(item_branch, '*') = COALESCE(${h.item_branch}::text, '*')
        AND supplier_cd = ${h.supplier_cd}
        AND COALESCE(loc_cd, '*') = COALESCE(${h.loc_cd}::text, '*')
        AND COALESCE(dlv_cd, '*') = COALESCE(${h.dlv_cd}::text, '*')
        AND start_date < ${h.start_date}::date
        AND end_date = (${h.start_date}::date - INTERVAL '1 day')::date
      RETURNING id`) as any[];
    restored += res.length;
  }
  const removed = (await sql`
    DELETE FROM price_history h
    USING price_request_lines l
    WHERE h.request_line_id = l.id AND h.company_id = ${companyId} AND l.request_id = ${requestId}
    RETURNING h.id`) as any[];

  await sql`
    UPDATE price_requests SET status = 'draft', updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${requestId}`;
  // 再出力できるよう出力済みフラグも戻す
  await sql`
    UPDATE price_request_lines SET exported_at = NULL
    WHERE company_id = ${companyId} AND request_id = ${requestId}`;
  await sql`
    INSERT INTO request_approvals (company_id, request_id, stage, action, approver_login_id, approver_name, comment)
    VALUES (${companyId}, ${requestId}, 'dept', 'reject', ${actor.loginId}, ${actor.name},
            ${opts.reason ?? "承認取消"})`;
  await addRequestMessage(
    companyId,
    requestId,
    actor,
    `承認を取り消し、単価履歴の反映（${removed.length}件）を元に戻しました。下書きとして修正できます。${
      opts.reason ? `（理由: ${opts.reason}）` : ""
    }`,
    true
  );
  return { removed: removed.length, restored };
}

/**
 * その申請をその人が承認・差し戻しできるかを検証する。できない場合は理由つきで例外。
 * 申請者に承認担当者が割り当てられていればその人だけ、無ければ承認者リストで判定する。
 */
async function assertCanApprove(
  companyId: string,
  requestId: string,
  stage: ApprovalStage,
  approverLoginId: string | null
): Promise<void> {
  const sql = getSql();
  const wf = await getWfSettings(companyId);
  const rows = (await sql`
    SELECT applicant_login_id FROM price_requests
    WHERE company_id = ${companyId} AND id = ${requestId} LIMIT 1`) as any[];
  const assigned = await assignedApprovers(companyId, rows[0]?.applicant_login_id ?? null);
  if (canApproveRequest(wf, stage, approverLoginId, assigned)) return;
  const label = stageLabelOf(wf, stage);
  const target = assigned[stage];
  if (!target) throw new Error(`${label}承認の権限がありません（承認者に指定されていません）。`);
  const who = (await sql`
    SELECT name FROM employees
    WHERE company_id = ${companyId} AND login_id = ${target} LIMIT 1`) as any[];
  const name = who[0]?.name ? `${who[0].name}さん` : `社員番号 ${target} の方`;
  throw new Error(`${label}承認の権限がありません（この申請の${label}担当は ${name} です）。`);
}

/**
 * 承認（stage=mgr: pending → mgr_approved、stage=dept: mgr_approved → approved）。
 * 部門長承認で単価履歴（price_history）へ反映する。
 */
export async function approveRequest(
  companyId: string,
  requestId: string,
  stage: ApprovalStage,
  approver: { loginId: string | null; name: string },
  comment: string | null
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const wf = await getWfSettings(companyId);
  const applicantOf = ((await sql`
    SELECT applicant_login_id FROM price_requests
    WHERE company_id = ${companyId} AND id = ${requestId} LIMIT 1`) as any[])[0] ?? {};
  await assertCanApprove(companyId, requestId, stage, approver.loginId);
  // バイヤー確認が割り当てられている申請は pending → buyer_approved → mgr_approved → approved
  const assigned = await assignedApprovers(companyId, applicantOf.applicant_login_id ?? null);
  const from =
    stage === "buyer" ? "pending" : stage === "mgr" ? (assigned.buyer ? "buyer_approved" : "pending") : "mgr_approved";
  const to = stage === "buyer" ? "buyer_approved" : stage === "mgr" ? "mgr_approved" : "approved";
  const rows = await sql`
    UPDATE price_requests SET status = ${to}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${requestId} AND status = ${from}
    RETURNING id`;
  if ((rows as any[]).length === 0) {
    // 前の段階が残っている場合は、何を待っているのかを伝える
    const now = ((await sql`
      SELECT status FROM price_requests WHERE company_id = ${companyId} AND id = ${requestId} LIMIT 1`) as any[])[0]
      ?.status as RequestStatus | undefined;
    const nextStage = now ? stageOfStatus(now, assigned) : null;
    throw new Error(
      nextStage && nextStage !== stage
        ? `${stageLabelOf(wf, stage)}承認できませんでした（この申請は${stageLabelOf(wf, nextStage)}の処理待ちです）。`
        : "承認できませんでした（既に処理済みか、承認段階が一致しません）"
    );
  }
  await sql`
    INSERT INTO request_approvals (company_id, request_id, stage, action, approver_login_id, approver_name, comment)
    VALUES (${companyId}, ${requestId}, ${stage}, 'approve', ${approver.loginId}, ${approver.name}, ${comment})`;
  const stageLabel = stageLabelOf(wf, stage);
  await addRequestMessage(
    companyId,
    requestId,
    approver,
    `${stageLabel}承認しました。${comment ? `（${comment}）` : ""}`,
    true
  );
  if (to === "approved") {
    await applyApprovedToHistory(companyId, requestId);
  }
}

/** 差し戻し（pending / mgr_approved → rejected）。 */
export async function rejectRequest(
  companyId: string,
  requestId: string,
  stage: ApprovalStage,
  approver: { loginId: string | null; name: string },
  comment: string | null
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await assertCanApprove(companyId, requestId, stage, approver.loginId);
  const applicant = ((await sql`
    SELECT applicant_login_id FROM price_requests
    WHERE company_id = ${companyId} AND id = ${requestId} LIMIT 1`) as any[])[0] ?? {};
  const assigned = await assignedApprovers(companyId, applicant.applicant_login_id ?? null);
  const from =
    stage === "buyer" ? "pending" : stage === "mgr" ? (assigned.buyer ? "buyer_approved" : "pending") : "mgr_approved";
  const rows = await sql`
    UPDATE price_requests SET status = 'rejected', updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${requestId} AND status = ${from}
    RETURNING id`;
  if ((rows as any[]).length === 0)
    throw new Error("差し戻しできませんでした（既に処理済みか、承認段階が一致しません）");
  await sql`
    INSERT INTO request_approvals (company_id, request_id, stage, action, approver_login_id, approver_name, comment)
    VALUES (${companyId}, ${requestId}, ${stage}, 'reject', ${approver.loginId}, ${approver.name}, ${comment})`;
  await addRequestMessage(
    companyId,
    requestId,
    approver,
    `差し戻しました。${comment ? `（理由: ${comment}）` : ""}`,
    true
  );
}

/**
 * 承認済み明細を単価履歴へ反映する。
 * 同一キー（品目CD・枝番・取引先CD・納入場所CD・納品先CD）の直前の適用中レコードは
 * 新適用開始日の前日で適用終了に更新し、新しい行を末尾（適用終了 2099/12/31）として追加する。
 */
async function applyApprovedToHistory(companyId: string, requestId: string): Promise<void> {
  const sql = getSql();
  const lines = await sql`
    SELECT * FROM price_request_lines
    WHERE company_id = ${companyId} AND request_id = ${requestId} ORDER BY seq`;
  // 申請情報（申請No・申請者）も履歴に残し、後から改訂の経緯をたどれるようにする
  const reqRows = await sql`
    SELECT req_no, applicant_name FROM price_requests
    WHERE company_id = ${companyId} AND id = ${requestId} LIMIT 1`;
  const reqNo = (reqRows as any[])[0]?.req_no ?? null;
  const applicantName = (reqRows as any[])[0]?.applicant_name ?? null;
  for (const l of lines as any[]) {
    // 直前の適用中レコードを閉じる（同一キーで開始日が新開始日より前、終了日が新開始日以降）
    await sql`
      UPDATE price_history SET end_date = (${l.start_date}::date - INTERVAL '1 day')::date
      WHERE company_id = ${companyId}
        AND item_cd = ${l.item_cd}
        AND COALESCE(item_branch, '*') = COALESCE(${l.item_branch}::text, '*')
        AND supplier_cd = ${l.supplier_cd}
        AND COALESCE(loc_cd, '*') = COALESCE(${l.loc_cd}::text, '*')
        AND COALESCE(dlv_cd, '*') = COALESCE(${l.dlv_cd}::text, '*')
        AND start_date < ${l.start_date}::date
        AND (end_date IS NULL OR end_date >= ${l.start_date}::date)`;
    await sql`
      INSERT INTO price_history (
        company_id, item_cd, item_branch, item_name, supplier_cd, supplier_name,
        unit_cd, lot_qty, currency, loc_cd, dlv_cd, wg_cd,
        start_date, end_date, price, price_before, tax_cd, monthly_qty, reason, source, request_line_id,
        bd_supply_mat, bd_material, bd_revision, bd_design, bd_forex, bd_other,
        req_no, applicant_name, approved_at
      ) VALUES (
        ${companyId}, ${l.item_cd}, ${l.item_branch}, ${l.item_name}, ${l.supplier_cd}, ${l.supplier_name},
        ${l.unit_cd}, ${l.lot_qty}, ${l.currency}, ${l.loc_cd}, ${l.dlv_cd}, ${l.wg_cd},
        ${l.start_date}, ${l.end_date}, ${l.new_price}, ${l.current_price}, ${l.tax_cd},
        ${l.monthly_qty}, ${l.reason_note}, 'approval', ${l.id},
        ${l.bd_supply_mat}, ${l.bd_material}, ${l.bd_revision}, ${l.bd_design}, ${l.bd_forex}, ${l.bd_other},
        ${reqNo}, ${applicantName}, NOW()
      )`;
  }
}

export async function addRequestMessage(
  companyId: string,
  requestId: string,
  author: { loginId: string | null; name: string },
  body: string,
  isSystem = false
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO request_messages (company_id, request_id, author_login_id, author_name, body, is_system)
    VALUES (${companyId}, ${requestId}, ${author.loginId}, ${author.name}, ${body}, ${isSystem})`;
}


// ===== 承認ワークフロー設定 =====

export interface WfSettings {
  /** 承認段階数（1=MGRのみ / 2=MGR→部門長） */
  stages: 1 | 2;
  /** 各段階の承認者（社員番号）。空＝全管理者が承認できる */
  mgrApprovers: string[];
  deptApprovers: string[];
  /** 帳票・画面に表示する承認段階の名称 */
  buyerLabel: string;
  mgrLabel: string;
  deptLabel: string;
  /** 申請番号の書式。{YYYY} {YY} {MM} {SEQ}（{SEQ4} で桁数指定）が使える */
  reqFormat: string;
  /** 連番のリセット単位 */
  reqReset: "none" | "year" | "month";
}

/**
 * 申請番号の採番ルールを適用して表示用の番号を作る。
 * 例: 書式 "PU-{YYYY}{MM}-{SEQ4}" / 2026年8月 / 連番12 → "PU-202608-0012"
 */
export function formatReqCode(format: string, seq: number, at: Date): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, "0");
  return (format || "{YYYY}-{SEQ4}")
    .replace(/\{YYYY\}/g, String(y))
    .replace(/\{YY\}/g, String(y).slice(-2))
    .replace(/\{MM\}/g, m)
    .replace(/\{SEQ(\d*)\}/g, (_, d: string) =>
      d ? String(seq).padStart(Number(d), "0") : String(seq)
    );
}

const WF_DEFAULT: WfSettings = {
  stages: 2,
  mgrApprovers: [],
  deptApprovers: [],
  buyerLabel: "バイヤー",
  mgrLabel: "MGR",
  deptLabel: "部門長",
  reqFormat: "{YYYY}-{SEQ4}",
  reqReset: "year",
};

/** 承認ワークフロー設定を取得（未設定なら既定値）。 */
export async function getWfSettings(companyId: string): Promise<WfSettings> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM wf_settings WHERE company_id = ${companyId} LIMIT 1`;
  const r = (rows as any[])[0];
  if (!r) return { ...WF_DEFAULT };
  return {
    // 承認は MGR → 部門長 の2段階固定（過去に1段階で保存されていても2として扱う）
    stages: 2,
    mgrApprovers: Array.isArray(r.mgr_approvers) ? r.mgr_approvers : [],
    deptApprovers: Array.isArray(r.dept_approvers) ? r.dept_approvers : [],
    buyerLabel: r.buyer_label || "バイヤー",
    mgrLabel: r.mgr_label || "MGR",
    deptLabel: r.dept_label || "部門長",
    reqFormat: r.req_format || WF_DEFAULT.reqFormat,
    reqReset: r.req_reset === "none" || r.req_reset === "month" ? r.req_reset : "year",
  };
}

/** 承認ワークフロー設定を保存（管理者操作）。 */
export async function saveWfSettings(companyId: string, w: WfSettings): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const clean = (a: string[]) => [...new Set(a.map((x) => x.trim()).filter(Boolean))];
  await sql`
    INSERT INTO wf_settings (company_id, stages, mgr_approvers, dept_approvers,
                             buyer_label, mgr_label, dept_label, req_format, req_reset)
    VALUES (${companyId}, ${w.stages}, ${clean(w.mgrApprovers)}, ${clean(w.deptApprovers)},
            ${w.buyerLabel.trim() || "バイヤー"},
            ${w.mgrLabel.trim() || "MGR"}, ${w.deptLabel.trim() || "部門長"},
            ${w.reqFormat.trim() || WF_DEFAULT.reqFormat}, ${w.reqReset})
    ON CONFLICT (company_id) DO UPDATE SET
      stages = EXCLUDED.stages,
      mgr_approvers = EXCLUDED.mgr_approvers,
      dept_approvers = EXCLUDED.dept_approvers,
      buyer_label = EXCLUDED.buyer_label,
      mgr_label = EXCLUDED.mgr_label,
      dept_label = EXCLUDED.dept_label,
      req_format = EXCLUDED.req_format,
      req_reset = EXCLUDED.req_reset,
      updated_at = NOW()`;
}

/**
 * その段階を承認できるユーザーか。
 * 承認者リストが空の段階は、全管理者が承認できる（既定の運用）。
 */
/**
 * 申請者に割り当てられた承認担当者（社員マスタの mgr_login_id / dept_login_id）。
 * MGRが複数いる場合に、申請者ごとにどのMGRが承認するかを決めるために使う。
 */
export interface AssignedApprovers {
  /** MGR承認の前に確認するバイヤー。null＝バイヤー確認の段階なし */
  buyer: string | null;
  mgr: string | null;
  dept: string | null;
}

export async function assignedApprovers(
  companyId: string,
  applicantLoginId: string | null
): Promise<AssignedApprovers> {
  if (!applicantLoginId) return { buyer: null, mgr: null, dept: null };
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT buyer_login_id, mgr_login_id, dept_login_id FROM employees
    WHERE company_id = ${companyId} AND login_id = ${applicantLoginId} LIMIT 1`) as any[];
  return {
    buyer: rows[0]?.buyer_login_id ?? null,
    mgr: rows[0]?.mgr_login_id ?? null,
    dept: rows[0]?.dept_login_id ?? null,
  };
}

/**
 * 申請の現在ステータスに対応する承認段階。
 * バイヤー確認が割り当てられている申請は pending＝バイヤー確認、
 * 割り当てが無ければ pending＝MGR承認。
 */
export function stageOfStatus(
  status: RequestStatus,
  assigned: AssignedApprovers
): ApprovalStage | null {
  if (status === "pending") return assigned.buyer ? "buyer" : "mgr";
  if (status === "buyer_approved") return "mgr";
  if (status === "mgr_approved") return "dept";
  return null;
}

/** 申請者ごとの承認担当者の一覧（承認画面の絞り込み用）。 */
export async function assignedApproverMap(
  companyId: string
): Promise<Map<string, AssignedApprovers>> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT login_id, buyer_login_id, mgr_login_id, dept_login_id FROM employees
    WHERE company_id = ${companyId}`) as any[];
  const m = new Map<string, AssignedApprovers>();
  for (const r of rows) {
    m.set(r.login_id, {
      buyer: r.buyer_login_id ?? null,
      mgr: r.mgr_login_id ?? null,
      dept: r.dept_login_id ?? null,
    });
  }
  return m;
}

/** 承認者が未割当の場合のフォールバック（全段階 null） */
export const NO_ASSIGNED: AssignedApprovers = { buyer: null, mgr: null, dept: null };

/**
 * その申請を、その人が承認できるか。
 * 申請者に承認担当者が割り当てられていればその人だけ、
 * 割り当てが無ければ承認W/Fの承認者リスト（空なら全管理者）で判定する。
 */
/** 承認段階の表示名（設定した名称を使う） */
export function stageLabelOf(wf: WfSettings, stage: ApprovalStage): string {
  return stage === "buyer" ? wf.buyerLabel : stage === "mgr" ? wf.mgrLabel : wf.deptLabel;
}

export function canApproveRequest(
  wf: WfSettings,
  stage: ApprovalStage,
  approverLoginId: string | null,
  assigned: AssignedApprovers
): boolean {
  const target = assigned[stage];
  if (target) return approverLoginId === target;
  // バイヤー確認は割当がある申請にしか存在しない段階なので、フォールバックしない
  if (stage === "buyer") return false;
  return canApproveStage(wf, stage, approverLoginId);
}

export function canApproveStage(
  wf: WfSettings,
  stage: ApprovalStage,
  loginId: string | null
): boolean {
  if (stage === "buyer") return false;
  const list = stage === "mgr" ? wf.mgrApprovers : wf.deptApprovers;
  if (list.length === 0) return true;
  return loginId != null && list.includes(loginId);
}

// ===== 単価履歴 =====

export async function listPrices(
  companyId: string,
  opts: {
    q?: string | null;
    supplierCd?: string | null;
    /** 指定時、その担当バイヤーの取引先の履歴のみ返す */
    buyerLoginId?: string | null;
    activeOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ rows: PriceHistoryRow[]; total: number }> {
  await ensureSchema();
  const sql = getSql();
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.q ? `%${opts.q}%` : null;
  const activeOnly = opts.activeOnly ?? false;
  const where = sql`
    company_id = ${companyId}
    AND (${q}::text IS NULL OR item_cd ILIKE ${q} OR item_name ILIKE ${q}
         OR supplier_cd ILIKE ${q} OR supplier_name ILIKE ${q})
    AND (${opts.supplierCd ?? null}::text IS NULL OR supplier_cd = ${opts.supplierCd ?? null})
    AND (${opts.buyerLoginId ?? null}::text IS NULL OR EXISTS (
      SELECT 1 FROM suppliers sp
      WHERE sp.company_id = price_history.company_id AND sp.code = price_history.supplier_cd
        AND ${opts.buyerLoginId ?? null} IN (sp.buyer_login_id, sp.buyer_sub_login_id, sp.chaser_login_id)))
    AND (NOT ${activeOnly} OR (start_date <= CURRENT_DATE AND (end_date IS NULL OR end_date >= CURRENT_DATE)))`;
  const [rows, cnt] = await Promise.all([
    sql`
      SELECT * FROM price_history WHERE ${where}
      ORDER BY item_cd, supplier_cd, start_date DESC
      LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT COUNT(*)::int AS n FROM price_history WHERE ${where}`,
  ]);
  return { rows: (rows as any[]).map(mapHistory), total: Number((cnt as any)[0]?.n ?? 0) };
}

/** ある品目×取引先の改訂履歴（納入場所別も含めて時系列）。 */
export async function priceHistoryFor(
  companyId: string,
  itemCd: string,
  supplierCd: string | null,
  buyerLoginId: string | null = null
): Promise<PriceHistoryRow[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM price_history
    WHERE company_id = ${companyId} AND item_cd = ${itemCd}
      AND (${supplierCd}::text IS NULL OR supplier_cd = ${supplierCd})
      AND (${buyerLoginId}::text IS NULL OR EXISTS (
        SELECT 1 FROM suppliers sp
        WHERE sp.company_id = price_history.company_id AND sp.code = price_history.supplier_cd
          AND ${buyerLoginId} IN (sp.buyer_login_id, sp.buyer_sub_login_id, sp.chaser_login_id)))
    ORDER BY supplier_cd, COALESCE(loc_cd, '*'), COALESCE(dlv_cd, '*'), start_date DESC
    LIMIT 1000`;
  return (rows as any[]).map(mapHistory);
}

/**
 * 現行単価の自動取得（申請フォーム用）。
 * 指定日時点で適用中の単価を、キー（品目・枝番・取引先・納入場所）で検索する。
 */
export async function currentPriceFor(
  companyId: string,
  itemCd: string,
  supplierCd: string,
  opts: { branch?: string | null; locCd?: string | null; onDate?: string | null } = {}
): Promise<PriceHistoryRow | null> {
  await ensureSchema();
  const sql = getSql();
  const onDate = opts.onDate ?? null;
  const rows = await sql`
    SELECT * FROM price_history
    WHERE company_id = ${companyId} AND item_cd = ${itemCd} AND supplier_cd = ${supplierCd}
      AND COALESCE(item_branch, '*') = COALESCE(${opts.branch ?? null}::text, '*')
      AND COALESCE(loc_cd, '*') = COALESCE(${opts.locCd ?? null}::text, '*')
      AND start_date <= COALESCE(${onDate}::date, CURRENT_DATE)
      AND (end_date IS NULL OR end_date >= COALESCE(${onDate}::date, CURRENT_DATE))
    ORDER BY start_date DESC
    LIMIT 1`;
  const r = (rows as any[])[0];
  return r ? mapHistory(r) : null;
}

/** 直近の申請済み内容（承認用紙の「直近申請内容」欄）。指定開始日より前で最新の履歴。 */
export async function previousHistoryFor(
  companyId: string,
  line: {
    itemCd: string;
    itemBranch: string | null;
    supplierCd: string;
    locCd: string | null;
    dlvCd: string | null;
    startDate: string;
    requestLineId?: string | null;
  }
): Promise<PriceHistoryRow | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM price_history
    WHERE company_id = ${companyId} AND item_cd = ${line.itemCd} AND supplier_cd = ${line.supplierCd}
      AND COALESCE(item_branch, '*') = COALESCE(${line.itemBranch}::text, '*')
      AND COALESCE(loc_cd, '*') = COALESCE(${line.locCd}::text, '*')
      AND COALESCE(dlv_cd, '*') = COALESCE(${line.dlvCd}::text, '*')
      AND start_date < ${line.startDate}::date
      AND (${line.requestLineId ?? null}::uuid IS NULL OR request_line_id IS DISTINCT FROM ${line.requestLineId ?? null})
    ORDER BY start_date DESC
    LIMIT 1`;
  const r = (rows as any[])[0];
  return r ? mapHistory(r) : null;
}

/** 履歴に紐づく申請明細＋申請情報（承認用紙の直近申請欄の内訳表示用） */
export async function requestLineDetail(
  companyId: string,
  requestLineId: string
): Promise<{ line: PriceRequestLine; request: PriceRequest } | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT l.*, r.id AS r_id, r.req_no, r.title, r.status AS r_status,
           r.applicant_login_id AS r_applicant_login_id, r.applicant_name AS r_applicant_name,
           r.submitted_at AS r_submitted_at, r.created_at AS r_created_at
    FROM price_request_lines l
    JOIN price_requests r ON r.id = l.request_id
    WHERE l.company_id = ${companyId} AND l.id = ${requestLineId}
    LIMIT 1`;
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    line: mapLine(r),
    request: mapRequest({
      id: r.r_id,
      req_no: r.req_no,
      title: r.title,
      status: r.r_status,
      applicant_login_id: r.r_applicant_login_id,
      applicant_name: r.r_applicant_name,
      submitted_at: r.r_submitted_at,
      created_at: r.r_created_at,
    }),
  };
}

// ===== マスタ =====

export async function listItems(
  companyId: string,
  opts: { q?: string | null; limit?: number; offset?: number } = {}
): Promise<{ rows: Item[]; total: number }> {
  await ensureSchema();
  const sql = getSql();
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.q ? `%${opts.q}%` : null;
  const [rows, cnt] = await Promise.all([
    // 現在の取引先は単価履歴の最新行（適用開始日が最も新しい行）から引く
    sql`
      SELECT i.*, h.supplier_cd AS current_supplier_cd, h.supplier_name AS current_supplier_name,
             h.start_date AS current_start_date
      FROM items i
      LEFT JOIN LATERAL (
        SELECT ph.supplier_cd, ph.supplier_name, ph.start_date
        FROM price_history ph
        WHERE ph.company_id = i.company_id AND ph.item_cd = i.code
        ORDER BY ph.start_date DESC, ph.created_at DESC
        LIMIT 1
      ) h ON true
      WHERE i.company_id = ${companyId}
        AND (${q}::text IS NULL OR i.code ILIKE ${q} OR i.name ILIKE ${q})
      ORDER BY i.code, i.branch LIMIT ${limit} OFFSET ${offset}`,
    sql`
      SELECT COUNT(*)::int AS n FROM items
      WHERE company_id = ${companyId}
        AND (${q}::text IS NULL OR code ILIKE ${q} OR name ILIKE ${q})`,
  ]);
  return {
    rows: (rows as any[]).map((r) => ({
      id: r.id,
      code: r.code,
      branch: r.branch === "*" ? null : r.branch,
      name: r.name,
      unitCd: r.unit_cd ?? null,
      taxCd: r.tax_cd ?? null,
      notes: r.notes ?? null,
      active: Boolean(r.active),
      acctCd: r.acct_cd ?? null,
      acctName: r.acct_name ?? null,
      acctDetail: r.acct_detail ?? null,
      icsName: r.ics_name ?? null,
      itemClass: r.item_class ?? null,
      materialClass: r.material_class ?? null,
      createdAt: r.created_at ? tsStr(r.created_at) : null,
      currentSupplierCd: r.current_supplier_cd ?? null,
      currentSupplierName: r.current_supplier_name ?? null,
      currentStartDate: r.current_start_date ? dateStr(r.current_start_date) : null,
    })),
    total: Number((cnt as any)[0]?.n ?? 0),
  };
}

export interface ItemInput {
  code: string;
  branch?: string | null;
  name: string;
  unitCd?: string | null;
  taxCd?: string | null;
  notes?: string | null;
  acctCd?: string | null;
  acctName?: string | null;
  acctDetail?: string | null;
  icsName?: string | null;
  itemClass?: string | null;
  materialClass?: string | null;
}

export async function upsertItem(companyId: string, item: ItemInput): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const branch = (item.branch ?? "").trim() || "*";
  await sql`
    INSERT INTO items (company_id, code, branch, name, unit_cd, tax_cd, notes,
                       acct_cd, acct_name, acct_detail, ics_name, item_class, material_class)
    VALUES (${companyId}, ${item.code.trim()}, ${branch}, ${item.name.trim()},
            ${item.unitCd ?? null}, ${item.taxCd ?? null}, ${item.notes ?? null},
            ${item.acctCd ?? null}, ${item.acctName ?? null}, ${item.acctDetail ?? null},
            ${item.icsName ?? null}, ${item.itemClass ?? null}, ${item.materialClass ?? null})
    ON CONFLICT (company_id, code, branch) DO UPDATE SET
      name = EXCLUDED.name,
      unit_cd = COALESCE(EXCLUDED.unit_cd, items.unit_cd),
      tax_cd = COALESCE(EXCLUDED.tax_cd, items.tax_cd),
      notes = COALESCE(EXCLUDED.notes, items.notes),
      acct_cd = COALESCE(EXCLUDED.acct_cd, items.acct_cd),
      acct_name = COALESCE(EXCLUDED.acct_name, items.acct_name),
      acct_detail = COALESCE(EXCLUDED.acct_detail, items.acct_detail),
      ics_name = COALESCE(EXCLUDED.ics_name, items.ics_name),
      item_class = COALESCE(EXCLUDED.item_class, items.item_class),
      material_class = COALESCE(EXCLUDED.material_class, items.material_class),
      active = true,
      updated_at = NOW()`;
}

/**
 * 品番マスタの一括 upsert。
 * 7万件規模の取込を現実的な時間で終わらせるため、1文で複数行をまとめて登録する。
 * 同一バッチ内の重複キー（後勝ち）は ON CONFLICT が二重更新でエラーになるため事前に除く。
 */
export async function upsertItemsBatch(companyId: string, items: ItemInput[]): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  const CHUNK = 500;
  const dedup = new Map<string, ItemInput>();
  for (const it of items) {
    const code = it.code.trim();
    if (!code) continue;
    const branch = (it.branch ?? "").trim() || "*";
    dedup.set(`${code}\u0000${branch}`, it);
  }
  const rows = [...dedup.values()];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    // 列ごとの配列を unnest して1文でまとめて登録する
    const cols = {
      code: chunk.map((r) => r.code.trim()),
      branch: chunk.map((r) => (r.branch ?? "").trim() || "*"),
      name: chunk.map((r) => r.name.trim()),
      unit: chunk.map((r) => r.unitCd ?? null),
      tax: chunk.map((r) => r.taxCd ?? null),
      notes: chunk.map((r) => r.notes ?? null),
      acctCd: chunk.map((r) => r.acctCd ?? null),
      acctName: chunk.map((r) => r.acctName ?? null),
      acctDetail: chunk.map((r) => r.acctDetail ?? null),
      ics: chunk.map((r) => r.icsName ?? null),
      itemClass: chunk.map((r) => r.itemClass ?? null),
      materialClass: chunk.map((r) => r.materialClass ?? null),
    };
    await sql`
      INSERT INTO items (company_id, code, branch, name, unit_cd, tax_cd, notes,
                         acct_cd, acct_name, acct_detail, ics_name, item_class, material_class)
      SELECT ${companyId}::uuid, * FROM unnest(
        ${cols.code}::text[], ${cols.branch}::text[], ${cols.name}::text[],
        ${cols.unit}::text[], ${cols.tax}::text[], ${cols.notes}::text[],
        ${cols.acctCd}::text[], ${cols.acctName}::text[], ${cols.acctDetail}::text[],
        ${cols.ics}::text[], ${cols.itemClass}::text[], ${cols.materialClass}::text[])
      ON CONFLICT (company_id, code, branch) DO UPDATE SET
        name = EXCLUDED.name,
        unit_cd = COALESCE(EXCLUDED.unit_cd, items.unit_cd),
        tax_cd = COALESCE(EXCLUDED.tax_cd, items.tax_cd),
        notes = COALESCE(EXCLUDED.notes, items.notes),
        acct_cd = COALESCE(EXCLUDED.acct_cd, items.acct_cd),
        acct_name = COALESCE(EXCLUDED.acct_name, items.acct_name),
        acct_detail = COALESCE(EXCLUDED.acct_detail, items.acct_detail),
        ics_name = COALESCE(EXCLUDED.ics_name, items.ics_name),
        item_class = COALESCE(EXCLUDED.item_class, items.item_class),
        material_class = COALESCE(EXCLUDED.material_class, items.material_class),
        active = true,
        updated_at = NOW()`;
  }
  return rows.length;
}

/** 登録済み品番の編集（品目CD・枝番はキーのため変更しない）。 */
export async function updateItem(
  companyId: string,
  id: string,
  item: Omit<ItemInput, "code" | "branch" | "unitCd" | "taxCd"> & { active: boolean }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE items SET
      name = ${item.name.trim()},
      notes = ${item.notes ?? null},
      acct_cd = ${item.acctCd ?? null},
      acct_name = ${item.acctName ?? null},
      acct_detail = ${item.acctDetail ?? null},
      ics_name = ${item.icsName ?? null},
      item_class = ${item.itemClass ?? null},
      material_class = ${item.materialClass ?? null},
      active = ${item.active},
      updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}
    RETURNING id`;
  if ((rows as any[]).length === 0) throw new Error("品番が見つかりません。");
}

export async function deleteItem(companyId: string, id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM items WHERE company_id = ${companyId} AND id = ${id}`;
}

export async function listSuppliers(
  companyId: string,
  opts: { q?: string | null; buyerLoginId?: string | null; limit?: number; offset?: number } = {}
): Promise<{ rows: Supplier[]; total: number }> {
  await ensureSchema();
  const sql = getSql();
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.q ? `%${opts.q}%` : null;
  // buyer が指定されたら担当取引先のみ（バイヤー本人の画面）
  const buyer = opts.buyerLoginId ?? null;
  const [rows, cnt] = await Promise.all([
    // 担当者の氏名は社員マスタ（employees）から引いて画面に表示する
    sql`
      SELECT s.*,
        (SELECT e.name FROM employees e
          WHERE e.company_id = s.company_id AND e.login_id = s.buyer_login_id) AS buyer_name,
        (SELECT e.name FROM employees e
          WHERE e.company_id = s.company_id AND e.login_id = s.buyer_sub_login_id) AS buyer_sub_name,
        (SELECT e.name FROM employees e
          WHERE e.company_id = s.company_id AND e.login_id = s.chaser_login_id) AS chaser_name
      FROM suppliers s
      WHERE s.company_id = ${companyId}
        AND (${q}::text IS NULL OR s.code ILIKE ${q} OR s.name ILIKE ${q})
        AND (${buyer}::text IS NULL
             OR ${buyer} IN (s.buyer_login_id, s.buyer_sub_login_id, s.chaser_login_id))
      ORDER BY s.code LIMIT ${limit} OFFSET ${offset}`,
    sql`
      SELECT COUNT(*)::int AS n FROM suppliers
      WHERE company_id = ${companyId}
        AND (${q}::text IS NULL OR code ILIKE ${q} OR name ILIKE ${q})
        AND (${buyer}::text IS NULL OR ${buyer} IN (buyer_login_id, buyer_sub_login_id, chaser_login_id))`,
  ]);
  return {
    rows: (rows as any[]).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      notes: r.notes ?? null,
      active: Boolean(r.active),
      buyerLoginId: r.buyer_login_id ?? null,
      buyerSubLoginId: r.buyer_sub_login_id ?? null,
      chaserLoginId: r.chaser_login_id ?? null,
      buyerName: r.buyer_name ?? null,
      buyerSubName: r.buyer_sub_name ?? null,
      chaserName: r.chaser_name ?? null,
    })),
    total: Number((cnt as any)[0]?.n ?? 0),
  };
}

export async function upsertSupplier(
  companyId: string,
  s: {
    code: string;
    name: string;
    notes?: string | null;
    buyerLoginId?: string | null;
    buyerSubLoginId?: string | null;
    chaserLoginId?: string | null;
  }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const buyer = (s.buyerLoginId ?? "").trim() || null;
  const buyerSub = (s.buyerSubLoginId ?? "").trim() || null;
  const chaser = (s.chaserLoginId ?? "").trim() || null;
  await sql`
    INSERT INTO suppliers (company_id, code, name, notes, buyer_login_id, buyer_sub_login_id, chaser_login_id)
    VALUES (${companyId}, ${s.code.trim()}, ${s.name.trim()}, ${s.notes ?? null},
            ${buyer}, ${buyerSub}, ${chaser})
    ON CONFLICT (company_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      notes = COALESCE(EXCLUDED.notes, suppliers.notes),
      buyer_login_id = COALESCE(EXCLUDED.buyer_login_id, suppliers.buyer_login_id),
      buyer_sub_login_id = COALESCE(EXCLUDED.buyer_sub_login_id, suppliers.buyer_sub_login_id),
      chaser_login_id = COALESCE(EXCLUDED.chaser_login_id, suppliers.chaser_login_id),
      active = true,
      updated_at = NOW()`;
}

/** 取引先の担当窓口（企画グループ／管理グループ）を一括で設定する。 */
export async function setSupplierContacts(
  companyId: string,
  rows: {
    code: string;
    name?: string | null;
    buyerLoginId?: string | null;
    buyerSubLoginId?: string | null;
    chaserLoginId?: string | null;
  }[]
): Promise<{ updated: number; created: number }> {
  await ensureSchema();
  const sql = getSql();
  let updated = 0;
  let created = 0;
  for (const r of rows) {
    const code = r.code.trim();
    if (!code) continue;
    const res = (await sql`
      INSERT INTO suppliers (company_id, code, name, buyer_login_id, buyer_sub_login_id, chaser_login_id)
      VALUES (${companyId}, ${code}, ${(r.name ?? "").trim()},
              ${(r.buyerLoginId ?? "").trim() || null},
              ${(r.buyerSubLoginId ?? "").trim() || null},
              ${(r.chaserLoginId ?? "").trim() || null})
      ON CONFLICT (company_id, code) DO UPDATE SET
        name = COALESCE(NULLIF(EXCLUDED.name, ''), suppliers.name),
        buyer_login_id = EXCLUDED.buyer_login_id,
        buyer_sub_login_id = EXCLUDED.buyer_sub_login_id,
        chaser_login_id = EXCLUDED.chaser_login_id,
        active = true,
        updated_at = NOW()
      RETURNING (xmax = 0) AS inserted`) as any[];
    if (res[0]?.inserted) created += 1;
    else updated += 1;
  }
  return { updated, created };
}

/** 担当バイヤーの割当・解除（管理者操作）。null で未割当に戻す。 */
export async function setSupplierBuyer(
  companyId: string,
  supplierId: string,
  buyerLoginId: string | null
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE suppliers SET buyer_login_id = ${buyerLoginId}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${supplierId}`;
}

/** 1件の取引先の担当窓口（バイヤー主／副・チェイサー）を設定する。 */
export async function setSupplierContactIds(
  companyId: string,
  supplierId: string,
  c: { buyerLoginId: string | null; buyerSubLoginId: string | null; chaserLoginId: string | null }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE suppliers SET
      buyer_login_id = ${c.buyerLoginId},
      buyer_sub_login_id = ${c.buyerSubLoginId},
      chaser_login_id = ${c.chaserLoginId},
      updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${supplierId}`;
}

/**
 * 指定の取引先がそのバイヤーの担当かを判定する（サーバー側の権限チェック）。
 * buyerLoginId が null（管理者）なら常に true。
 */
export async function canAccessSupplier(
  companyId: string,
  supplierCd: string,
  buyerLoginId: string | null
): Promise<boolean> {
  if (buyerLoginId == null) return true;
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT 1 FROM suppliers
    WHERE company_id = ${companyId} AND code = ${supplierCd}
      AND ${buyerLoginId} IN (buyer_login_id, buyer_sub_login_id, chaser_login_id)
    LIMIT 1`;
  return (rows as any[]).length > 0;
}

export async function deleteSupplier(companyId: string, id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM suppliers WHERE company_id = ${companyId} AND id = ${id}`;
}

/** 品目のインクリメンタル検索（申請フォームのオートコンプリート用） */
export async function searchItems(companyId: string, q: string, limit = 12): Promise<Item[]> {
  await ensureSchema();
  const sql = getSql();
  const pat = `%${q}%`;
  const rows = await sql`
    SELECT * FROM items
    WHERE company_id = ${companyId} AND active AND (code ILIKE ${pat} OR name ILIKE ${pat})
    ORDER BY code, branch LIMIT ${limit}`;
  return (rows as any[]).map((r) => ({
    id: r.id,
    code: r.code,
    branch: r.branch === "*" ? null : r.branch,
    name: r.name,
    unitCd: r.unit_cd ?? null,
    taxCd: r.tax_cd ?? null,
    notes: r.notes ?? null,
    active: Boolean(r.active),
  }));
}

/** 取引先で取引実績のある品目（単価履歴ベース）。単価申請は取引先ごとに行うため、その候補を返す。 */
export interface SupplierItem {
  code: string;
  branch: string | null;
  name: string;
  unitCd: string | null;
  lotQty: number | null;
  /** 現在適用中の単価（見つからなければ最新の単価） */
  currentPrice: number | null;
  /** その単価の適用開始日 */
  startDate: string | null;
  locCd: string | null;
  dlvCd: string | null;
}

/**
 * 取引先の取引品目を検索する（品目CD・品名の部分一致）。
 * 単価履歴から品目×納入場所ごとの最新行を取り、品名はマスタを優先して補完する。
 * q が空なら取引量の多い順ではなく品目CD順に先頭を返す（取引先選択直後の初期候補）。
 */
export async function searchSupplierItems(
  companyId: string,
  supplierCd: string,
  q: string,
  limit = 20
): Promise<SupplierItem[]> {
  await ensureSchema();
  const sql = getSql();
  const pat = q ? `%${q}%` : null;
  const rows = await sql`
    SELECT DISTINCT ON (h.item_cd, COALESCE(h.item_branch, '*'), COALESCE(h.loc_cd, '*'))
      h.item_cd, h.item_branch, h.unit_cd, h.lot_qty, h.price, h.start_date, h.loc_cd, h.dlv_cd,
      COALESCE(NULLIF(i.name, ''), h.item_name, '') AS name
    FROM price_history h
    LEFT JOIN items i
      ON i.company_id = h.company_id AND i.code = h.item_cd
     AND i.branch = COALESCE(h.item_branch, '*')
    WHERE h.company_id = ${companyId} AND h.supplier_cd = ${supplierCd}
      AND (${pat}::text IS NULL
           OR h.item_cd ILIKE ${pat} OR i.name ILIKE ${pat} OR h.item_name ILIKE ${pat})
    ORDER BY h.item_cd, COALESCE(h.item_branch, '*'), COALESCE(h.loc_cd, '*'), h.start_date DESC
    LIMIT ${Math.min(limit, 50)}`;
  return (rows as any[]).map((r) => ({
    code: r.item_cd,
    branch: r.item_branch && r.item_branch !== "*" ? r.item_branch : null,
    name: r.name ?? "",
    unitCd: r.unit_cd ?? null,
    lotQty: num(r.lot_qty),
    currentPrice: num(r.price),
    startDate: r.start_date ? dateStr(r.start_date) : null,
    locCd: r.loc_cd && r.loc_cd !== "*" ? r.loc_cd : null,
    dlvCd: r.dlv_cd && r.dlv_cd !== "*" ? r.dlv_cd : null,
  }));
}

/** 取引実績のある取引先の検索（単価履歴＋取引先マスタ）。申請の起点となる取引先選択に使う。 */
export async function searchActiveSuppliers(
  companyId: string,
  q: string,
  buyerLoginId: string | null = null,
  limit = 20
): Promise<{ code: string; name: string; itemCount: number }[]> {
  await ensureSchema();
  const sql = getSql();
  const pat = q ? `%${q}%` : null;
  const rows = await sql`
    SELECT s.code, s.name,
      (SELECT COUNT(DISTINCT h.item_cd)::int FROM price_history h
        WHERE h.company_id = s.company_id AND h.supplier_cd = s.code) AS item_count
    FROM suppliers s
    WHERE s.company_id = ${companyId} AND s.active
      AND (${pat}::text IS NULL OR s.code ILIKE ${pat} OR s.name ILIKE ${pat})
      AND (${buyerLoginId}::text IS NULL
           OR ${buyerLoginId} IN (s.buyer_login_id, s.buyer_sub_login_id, s.chaser_login_id))
    ORDER BY s.code
    LIMIT ${Math.min(limit, 50)}`;
  return (rows as any[]).map((r) => ({
    code: r.code,
    name: r.name ?? "",
    itemCount: Number(r.item_count ?? 0),
  }));
}

/** 取引先のインクリメンタル検索 */
export async function searchSuppliers(companyId: string, q: string, limit = 12): Promise<Supplier[]> {
  await ensureSchema();
  const sql = getSql();
  const pat = `%${q}%`;
  const rows = await sql`
    SELECT * FROM suppliers
    WHERE company_id = ${companyId} AND active AND (code ILIKE ${pat} OR name ILIKE ${pat})
    ORDER BY code LIMIT ${limit}`;
  return (rows as any[]).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    notes: r.notes ?? null,
    active: Boolean(r.active),
    buyerLoginId: r.buyer_login_id ?? null,
    buyerSubLoginId: r.buyer_sub_login_id ?? null,
    chaserLoginId: r.chaser_login_id ?? null,
  }));
}

// ===== データ移行（単価情報.xlsx → price_history） =====

export interface MigrationRow {
  item_cd: string;
  item_branch: string | null;
  supplier_cd: string;
  unit_cd: string | null;
  lot_qty: number | null;
  currency: string | null;
  loc_cd: string | null;
  dlv_cd: string | null;
  wg_cd: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
  price: number;
  price_before: number | null;
  memo1: string | null;
  memo2: string | null;
  memo3: string | null;
}

/**
 * 初期データ移行の実施状況。
 * 移行は運用開始時に過去履歴を引き継ぐための1回限りの作業。実施済みかどうかを判定する。
 */
export async function migrationStatus(companyId: string): Promise<{
  done: boolean;
  count: number;
  lastAt: string | null;
}> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*)::int AS n, MAX(created_at) AS last_at
    FROM price_history
    WHERE company_id = ${companyId} AND source = 'migration'`;
  const r = (rows as any[])[0];
  const count = Number(r?.n ?? 0);
  return { done: count > 0, count, lastAt: r?.last_at ? tsStr(r.last_at) : null };
}

/**
 * 移行データを一括登録し、品目・取引先マスタのスタブ（名称未設定）も upsert する。
 * 冪等化のため、同一キー＋開始日の既存移行行は挿入しない。
 * 登録件数（スキップ除く）を返す。
 */
export async function insertHistoryBatch(companyId: string, rows: MigrationRow[]): Promise<number> {
  await ensureSchema();
  const sql = getSql();
  if (rows.length === 0) return 0;
  const payload = JSON.stringify(rows);
  const recordset = sql`
    jsonb_to_recordset(${payload}::jsonb) AS x(
      item_cd text, item_branch text, supplier_cd text, unit_cd text,
      lot_qty double precision, currency text, loc_cd text, dlv_cd text, wg_cd text,
      start_date text, end_date text, price double precision, price_before double precision,
      memo1 text, memo2 text, memo3 text
    )`;
  const inserted = await sql`
    INSERT INTO price_history (
      company_id, item_cd, item_branch, supplier_cd, unit_cd, lot_qty, currency,
      loc_cd, dlv_cd, wg_cd, start_date, end_date, price, price_before,
      memo1, memo2, memo3, source
    )
    SELECT ${companyId}::uuid, x.item_cd, x.item_branch, x.supplier_cd, x.unit_cd, x.lot_qty, x.currency,
           x.loc_cd, x.dlv_cd, x.wg_cd, x.start_date::date, x.end_date::date, x.price, x.price_before,
           x.memo1, x.memo2, x.memo3, 'migration'
    FROM ${recordset}
    WHERE NOT EXISTS (
      SELECT 1 FROM price_history h
      WHERE h.company_id = ${companyId}
        AND h.source = 'migration'
        AND h.item_cd = x.item_cd
        AND COALESCE(h.item_branch, '*') = COALESCE(x.item_branch, '*')
        AND h.supplier_cd = x.supplier_cd
        AND COALESCE(h.loc_cd, '*') = COALESCE(x.loc_cd, '*')
        AND COALESCE(h.dlv_cd, '*') = COALESCE(x.dlv_cd, '*')
        AND h.start_date = x.start_date::date
    )
    RETURNING id`;
  // マスタのスタブを upsert（名称は空。後からマスタ取込・編集で補完）
  await sql`
    INSERT INTO items (company_id, code, branch, name)
    SELECT DISTINCT ${companyId}::uuid, x.item_cd, COALESCE(x.item_branch, '*'), ''
    FROM ${recordset}
    ON CONFLICT (company_id, code, branch) DO NOTHING`;
  await sql`
    INSERT INTO suppliers (company_id, code, name)
    SELECT DISTINCT ${companyId}::uuid, x.supplier_cd, ''
    FROM ${recordset}
    ON CONFLICT (company_id, code) DO NOTHING`;
  return (inserted as any[]).length;
}

/** 履歴の品名・取引先名をマスタから補完する（マスタ取込後のメンテ用） */
export async function backfillHistoryNames(companyId: string): Promise<{ items: number; suppliers: number }> {
  await ensureSchema();
  const sql = getSql();
  const r1 = await sql`
    UPDATE price_history h SET item_name = i.name
    FROM items i
    WHERE h.company_id = ${companyId} AND i.company_id = ${companyId}
      AND i.code = h.item_cd AND i.branch = COALESCE(h.item_branch, '*')
      AND i.name <> '' AND (h.item_name IS NULL OR h.item_name = '')
    RETURNING h.id`;
  const r2 = await sql`
    UPDATE price_history h SET supplier_name = s.name
    FROM suppliers s
    WHERE h.company_id = ${companyId} AND s.company_id = ${companyId}
      AND s.code = h.supplier_cd
      AND s.name <> '' AND (h.supplier_name IS NULL OR h.supplier_name = '')
    RETURNING h.id`;
  return { items: (r1 as any[]).length, suppliers: (r2 as any[]).length };
}

// ===== MC取込CSV出力 =====

/**
 * MC取込に出力する既存レコードの値（mcframe から移行/前回登録された現行行）。
 * 単価以外の項目は基幹側の登録内容をそのまま維持するために使う。
 */
export interface McBaseValues {
  itemBranch: string | null;
  itemName: string | null;
  supplierName: string | null;
  unitCd: string | null;
  lotQty: number | null;
  currency: string | null;
  locCd: string | null;
  dlvCd: string | null;
  wgCd: string | null;
  taxCd: string | null;
  memo1: string | null;
  memo2: string | null;
  memo3: string | null;
}

export interface ExportableLine extends PriceRequestLine {
  reqNo: number | null;
  reqCode: string | null;
  approvedAt: string | null;
  /** 同一キーの直前の単価履歴（無ければ null＝新規登録品） */
  base: McBaseValues | null;
}

/**
 * 出力対象の承認済み明細（未出力 or すべて）。
 * 同一キー（品目・枝番・取引先・納入場所・納品先）の直前の単価履歴を併せて取得し、
 * MC取込CSVでは単価・適用日以外の項目を既存値のまま維持できるようにする。
 */
export async function listExportableLines(
  companyId: string,
  opts: { includeExported?: boolean; requestId?: string | null; limit?: number } = {}
): Promise<ExportableLine[]> {
  await ensureSchema();
  const sql = getSql();
  const includeExported = opts.includeExported ?? false;
  const requestId = opts.requestId ?? null;
  const limit = Math.min(opts.limit ?? 1000, 5000);
  const rows = await sql`
    SELECT l.*, r.req_no, r.req_code,
      (SELECT MAX(a.created_at) FROM request_approvals a
       WHERE a.request_id = r.id AND a.stage = 'dept' AND a.action = 'approve') AS approved_at,
      b.item_branch AS b_item_branch, b.item_name AS b_item_name, b.supplier_name AS b_supplier_name,
      b.unit_cd AS b_unit_cd, b.lot_qty AS b_lot_qty, b.currency AS b_currency,
      b.loc_cd AS b_loc_cd, b.dlv_cd AS b_dlv_cd, b.wg_cd AS b_wg_cd, b.tax_cd AS b_tax_cd,
      b.memo1 AS b_memo1, b.memo2 AS b_memo2, b.memo3 AS b_memo3,
      (b.id IS NOT NULL) AS has_base
    FROM price_request_lines l
    JOIN price_requests r ON r.id = l.request_id
    LEFT JOIN LATERAL (
      SELECT h.* FROM price_history h
      WHERE h.company_id = l.company_id
        AND h.item_cd = l.item_cd
        AND COALESCE(h.item_branch, '*') = COALESCE(l.item_branch, '*')
        AND h.supplier_cd = l.supplier_cd
        AND COALESCE(h.loc_cd, '*') = COALESCE(l.loc_cd, '*')
        AND COALESCE(h.dlv_cd, '*') = COALESCE(l.dlv_cd, '*')
        AND h.start_date < l.start_date
      ORDER BY h.start_date DESC
      LIMIT 1
    ) b ON true
    WHERE l.company_id = ${companyId} AND r.status = 'approved'
      AND (${includeExported} OR l.exported_at IS NULL)
      AND (${requestId}::uuid IS NULL OR r.id = ${requestId}::uuid)
    ORDER BY r.req_no, l.seq
    LIMIT ${limit}`;
  return (rows as any[]).map((r) => ({
    ...mapLine(r),
    reqNo: r.req_no ?? null,
    reqCode: r.req_code ?? (r.req_no != null ? `#${r.req_no}` : null),
    approvedAt: r.approved_at ? tsStr(r.approved_at) : null,
    base: r.has_base
      ? {
          itemBranch: r.b_item_branch ?? null,
          itemName: r.b_item_name ?? null,
          supplierName: r.b_supplier_name ?? null,
          unitCd: r.b_unit_cd ?? null,
          lotQty: num(r.b_lot_qty),
          currency: r.b_currency ?? null,
          locCd: r.b_loc_cd ?? null,
          dlvCd: r.b_dlv_cd ?? null,
          wgCd: r.b_wg_cd ?? null,
          taxCd: r.b_tax_cd ?? null,
          memo1: r.b_memo1 ?? null,
          memo2: r.b_memo2 ?? null,
          memo3: r.b_memo3 ?? null,
        }
      : null,
  }));
}

/** 出力済みマーク */
export async function markExported(companyId: string, lineIds: string[]): Promise<void> {
  if (lineIds.length === 0) return;
  const sql = getSql();
  await sql`
    UPDATE price_request_lines SET exported_at = NOW()
    WHERE company_id = ${companyId} AND id = ANY(${lineIds}::uuid[])`;
}

// ===== 社員マスタ（社員一覧） =====

export interface Employee {
  id: string;
  loginId: string;
  name: string;
  /** 承認W/Fの段階。'mgr' | 'dept' | null（承認者でない） */
  wfRole: "mgr" | "dept" | null;
  role: "admin" | "member";
  email: string | null;
  active: boolean;
  /** この社員の申請を承認する担当者（社員番号）。未設定なら承認者全員が承認できる */
  buyerLoginId: string | null;
  mgrLoginId: string | null;
  deptLoginId: string | null;
  /** 承認担当者の氏名（表示用） */
  buyerName?: string | null;
  mgrName?: string | null;
  deptName?: string | null;
  /** アプリのユーザーとして登録済みか */
  userExists?: boolean;
}

/** 氏名の表記ゆれを吸収（全角スペース→半角・連続スペース圧縮）。名寄せに使う。 */
export function normalizeName(v: string): string {
  return v.replace(/[　\s]+/g, " ").trim();
}

/**
 * 「町野 真一（髙橋 彩佳）」のような併記を主担当と副担当に分解する。
 * 括弧が無ければ副担当は null。
 */
export function splitContactNames(v: string): { main: string; sub: string | null } {
  const t = normalizeName(v);
  const m = t.match(/^(.*?)[（(](.*?)[）)]\s*$/);
  if (m) return { main: normalizeName(m[1]), sub: normalizeName(m[2]) || null };
  return { main: t, sub: null };
}

export async function listEmployees(
  companyId: string,
  opts: { q?: string | null } = {}
): Promise<Employee[]> {
  await ensureSchema();
  const sql = getSql();
  const q = opts.q ? `%${opts.q}%` : null;
  const rows = await sql`
    SELECT e.*,
      EXISTS (SELECT 1 FROM users u WHERE u.login_id = e.login_id) AS user_exists,
      (SELECT b.name FROM employees b
        WHERE b.company_id = e.company_id AND b.login_id = e.buyer_login_id) AS buyer_name,
      (SELECT m.name FROM employees m
        WHERE m.company_id = e.company_id AND m.login_id = e.mgr_login_id) AS mgr_name,
      (SELECT d.name FROM employees d
        WHERE d.company_id = e.company_id AND d.login_id = e.dept_login_id) AS dept_name
    FROM employees e
    WHERE e.company_id = ${companyId}
      AND (${q}::text IS NULL OR e.login_id ILIKE ${q} OR e.name ILIKE ${q})
    ORDER BY e.login_id`;
  return (rows as any[]).map((r) => ({
    id: r.id,
    loginId: r.login_id,
    name: r.name ?? "",
    wfRole: r.wf_role === "mgr" || r.wf_role === "dept" ? r.wf_role : null,
    role: r.role === "admin" ? "admin" : "member",
    email: r.email ?? null,
    active: Boolean(r.active),
    buyerLoginId: r.buyer_login_id ?? null,
    mgrLoginId: r.mgr_login_id ?? null,
    deptLoginId: r.dept_login_id ?? null,
    buyerName: r.buyer_name ?? null,
    mgrName: r.mgr_name ?? null,
    deptName: r.dept_name ?? null,
    userExists: Boolean(r.user_exists),
  }));
}

/**
 * 承認W/Fの承認者リストを社員マスタから作り直す。
 * 承認者はユーザー登録画面の「承認W/F」で1人ずつ指定する運用のため、
 * 社員を追加・編集・削除したらその場で承認W/F設定へ反映する。
 */
export async function refreshApproversFromEmployees(
  companyId: string
): Promise<{ mgr: string[]; dept: string[] }> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT login_id, wf_role FROM employees
    WHERE company_id = ${companyId} AND active AND wf_role IN ('mgr', 'dept')
    ORDER BY login_id`) as any[];
  const mgr = rows.filter((r) => r.wf_role === "mgr").map((r) => r.login_id as string);
  const dept = rows.filter((r) => r.wf_role === "dept").map((r) => r.login_id as string);
  const wf = await getWfSettings(companyId);
  await saveWfSettings(companyId, { ...wf, mgrApprovers: mgr, deptApprovers: dept });
  return { mgr, dept };
}

export async function upsertEmployee(
  companyId: string,
  e: {
    loginId: string;
    name: string;
    wfRole?: "mgr" | "dept" | null;
    role?: "admin" | "member";
    email?: string | null;
    buyerLoginId?: string | null;
    mgrLoginId?: string | null;
    deptLoginId?: string | null;
  }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO employees (company_id, login_id, name, wf_role, role, email,
                           buyer_login_id, mgr_login_id, dept_login_id)
    VALUES (${companyId}, ${e.loginId.trim()}, ${normalizeName(e.name)},
            ${e.wfRole ?? null}, ${e.role ?? "member"}, ${e.email ?? null},
            ${e.buyerLoginId ?? null}, ${e.mgrLoginId ?? null}, ${e.deptLoginId ?? null})
    ON CONFLICT (company_id, login_id) DO UPDATE SET
      name = EXCLUDED.name,
      wf_role = EXCLUDED.wf_role,
      role = EXCLUDED.role,
      email = COALESCE(EXCLUDED.email, employees.email),
      buyer_login_id = COALESCE(EXCLUDED.buyer_login_id, employees.buyer_login_id),
      mgr_login_id = COALESCE(EXCLUDED.mgr_login_id, employees.mgr_login_id),
      dept_login_id = COALESCE(EXCLUDED.dept_login_id, employees.dept_login_id),
      active = true,
      updated_at = NOW()`;
  await refreshApproversFromEmployees(companyId);
}

/**
 * 登録済み社員の編集。社員番号（login_id）はユーザー・承認者の紐付けキーのため変更しない。
 * email は空文字で明示的にクリアできる（upsertEmployee とは異なり COALESCE しない）。
 */
export async function updateEmployee(
  companyId: string,
  id: string,
  e: {
    name: string;
    wfRole: "mgr" | "dept" | null;
    role: "admin" | "member";
    email: string | null;
    active: boolean;
    buyerLoginId: string | null;
    mgrLoginId: string | null;
    deptLoginId: string | null;
  }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE employees SET
      name = ${normalizeName(e.name)},
      wf_role = ${e.wfRole},
      role = ${e.role},
      email = ${e.email},
      active = ${e.active},
      buyer_login_id = ${e.buyerLoginId},
      mgr_login_id = ${e.mgrLoginId},
      dept_login_id = ${e.deptLoginId},
      updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${id}
    RETURNING id`;
  if ((rows as any[]).length === 0) throw new Error("社員が見つかりません。");
  await refreshApproversFromEmployees(companyId);
}

export async function deleteEmployee(companyId: string, id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM employees WHERE company_id = ${companyId} AND id = ${id}`;
  await refreshApproversFromEmployees(companyId);
}

/** 品目CD → 品名の対応表（帳票で品名が空のときの補完に使う） */
export async function itemNameMap(
  companyId: string,
  codes: string[]
): Promise<Map<string, string>> {
  const list = [...new Set(codes.filter(Boolean))];
  const m = new Map<string, string>();
  if (list.length === 0) return m;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT code, name FROM items
    WHERE company_id = ${companyId} AND code = ANY(${list}::text[]) AND name <> ''`) as any[];
  for (const r of rows) m.set(r.code, r.name);
  return m;
}

/** 氏名 → 社員番号の対応表（担当窓口の名寄せに使う） */
export async function employeeNameMap(companyId: string): Promise<Map<string, string>> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`SELECT login_id, name FROM employees WHERE company_id = ${companyId}`;
  const m = new Map<string, string>();
  for (const r of rows as any[]) {
    const n = normalizeName(r.name ?? "");
    if (n) m.set(n, r.login_id);
  }
  return m;
}

/**
 * 社員マスタからアプリのユーザーを登録・更新する。
 * 既存ユーザーは氏名・権限を更新し、未登録の社員は招待状態（pending）で作成する。
 * あわせて、承認W/F設定の承認者リストを社員マスタの「承認W/F」列で置き換える。
 */
export async function syncUsersFromEmployees(
  companyId: string
): Promise<{ created: number; updated: number; mgr: string[]; dept: string[] }> {
  await ensureSchema();
  const sql = getSql();
  const emps = await listEmployees(companyId);
  let created = 0;
  let updated = 0;
  for (const e of emps) {
    if (!e.active || !e.loginId) continue;
    const exists = await sql`SELECT id FROM users WHERE login_id = ${e.loginId} LIMIT 1`;
    if ((exists as any[]).length > 0) {
      await sql`
        UPDATE users SET name = ${e.name || e.loginId}, role = ${e.role}
        WHERE login_id = ${e.loginId}`;
      updated++;
    } else {
      await createInvitedUser(companyId, e.loginId, e.name || e.loginId, e.role, e.email);
      created++;
    }
  }
  // 承認者リストも社員マスタに合わせる
  const { mgr, dept } = await refreshApproversFromEmployees(companyId);
  return { created, updated, mgr, dept };
}

// ===== 申請の添付資料 =====

export interface RequestFile {
  id: string;
  requestId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: string;
  uploadedName: string | null;
  createdAt: string;
}

function mapFile(r: any): RequestFile {
  return {
    id: r.id,
    requestId: r.request_id,
    fileName: r.file_name,
    contentType: r.content_type ?? "application/octet-stream",
    sizeBytes: Number(r.size_bytes ?? 0),
    kind: r.kind ?? "quote",
    uploadedName: r.uploaded_name ?? null,
    createdAt: tsStr(r.created_at),
  };
}

/** 申請に紐づく添付資料の一覧（本体データは含まない） */
export async function listRequestFiles(
  companyId: string,
  requestId: string
): Promise<RequestFile[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, request_id, file_name, content_type, size_bytes, kind, uploaded_name, created_at
    FROM request_files
    WHERE company_id = ${companyId} AND request_id = ${requestId}
    ORDER BY created_at`;
  return (rows as any[]).map(mapFile);
}

/** 単価履歴の1行に紐づく添付資料（その明細を含む申請の添付） */
export async function filesForHistoryRow(
  companyId: string,
  requestLineId: string
): Promise<RequestFile[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT f.id, f.request_id, f.file_name, f.content_type, f.size_bytes, f.kind,
           f.uploaded_name, f.created_at
    FROM request_files f
    JOIN price_request_lines l ON l.request_id = f.request_id
    WHERE f.company_id = ${companyId} AND l.id = ${requestLineId}
    ORDER BY f.created_at`;
  return (rows as any[]).map(mapFile);
}

/** 複数の履歴行ぶんの添付をまとめて取得（単価履歴の一覧表示用） */
export async function filesForHistoryRows(
  companyId: string,
  requestLineIds: string[]
): Promise<Map<string, RequestFile[]>> {
  const ids = [...new Set(requestLineIds.filter(Boolean))];
  const out = new Map<string, RequestFile[]>();
  if (ids.length === 0) return out;
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT l.id AS line_id, f.id, f.request_id, f.file_name, f.content_type, f.size_bytes,
           f.kind, f.uploaded_name, f.created_at
    FROM request_files f
    JOIN price_request_lines l ON l.request_id = f.request_id
    WHERE f.company_id = ${companyId} AND l.id = ANY(${ids}::uuid[])
    ORDER BY f.created_at`;
  for (const r of rows as any[]) {
    const arr = out.get(r.line_id) ?? [];
    arr.push(mapFile(r));
    out.set(r.line_id, arr);
  }
  return out;
}

export interface HistoryReasonInput {
  itemCd: string;
  itemName: string | null;
  supplierCd: string;
  supplierName: string | null;
  locCd: string | null;
  startDate: string;
  reason: string | null;
  bdMaterial: number | null;
  bdRevision: number | null;
  bdDesign: number | null;
  bdForex: number | null;
  bdOther: number | null;
  applicantName: string | null;
}

/**
 * 単価改訂履歴の理由・内訳を既存の単価履歴に反映する（初期データ移行の補完）。
 * mcframe の単価情報には改訂理由も品名も含まれないため、改訂履歴のエクスポートで後から埋める。
 * 品目CD・取引先CD・納入場所CD・適用開始日で既存行を特定して更新する（新規行は作らない）。
 * 品名・取引先名は、移行で作られた名称なしのマスタ（スタブ）にも書き込む。
 */
export async function applyHistoryReasons(
  companyId: string,
  rows: HistoryReasonInput[]
): Promise<{ updated: number; unmatched: number; itemNames: number; supplierNames: number }> {
  await ensureSchema();
  const sql = getSql();
  const CHUNK = 500;
  let updated = 0;
  let itemNames = 0;
  let supplierNames = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const c = rows.slice(i, i + CHUNK);
    const src = sql`unnest(
        ${c.map((r) => r.itemCd)}::text[],
        ${c.map((r) => r.itemName ?? "")}::text[],
        ${c.map((r) => r.supplierCd)}::text[],
        ${c.map((r) => r.supplierName ?? "")}::text[],
        ${c.map((r) => r.locCd ?? "")}::text[],
        ${c.map((r) => r.startDate)}::date[],
        ${c.map((r) => r.reason ?? "")}::text[],
        ${c.map((r) => r.bdMaterial)}::numeric[],
        ${c.map((r) => r.bdRevision)}::numeric[],
        ${c.map((r) => r.bdDesign)}::numeric[],
        ${c.map((r) => r.bdForex)}::numeric[],
        ${c.map((r) => r.bdOther)}::numeric[],
        ${c.map((r) => r.applicantName ?? "")}::text[]
      ) AS s(item_cd, item_name, supplier_cd, supplier_name, loc_cd, start_date, reason,
             bd_material, bd_revision, bd_design, bd_forex, bd_other, applicant_name)`;
    const res = (await sql`
      UPDATE price_history h SET
        reason = COALESCE(NULLIF(s.reason, ''), h.reason),
        bd_material = COALESCE(s.bd_material, h.bd_material),
        bd_revision = COALESCE(s.bd_revision, h.bd_revision),
        bd_design = COALESCE(s.bd_design, h.bd_design),
        bd_forex = COALESCE(s.bd_forex, h.bd_forex),
        bd_other = COALESCE(s.bd_other, h.bd_other),
        applicant_name = COALESCE(NULLIF(s.applicant_name, ''), h.applicant_name),
        item_name = COALESCE(NULLIF(h.item_name, ''), NULLIF(s.item_name, '')),
        supplier_name = COALESCE(NULLIF(h.supplier_name, ''), NULLIF(s.supplier_name, ''))
      FROM ${src}
      WHERE h.company_id = ${companyId}
        AND h.item_cd = s.item_cd
        AND h.supplier_cd = s.supplier_cd
        AND COALESCE(h.loc_cd, '*') = COALESCE(NULLIF(s.loc_cd, ''), '*')
        AND h.start_date = s.start_date
      RETURNING h.id`) as any[];
    updated += res.length;

    // 移行で作られた名称なしのマスタ（スタブ）にも品名・取引先名を入れる
    const n1 = (await sql`
      UPDATE items i SET name = s.item_name, updated_at = NOW()
      FROM ${src}
      WHERE i.company_id = ${companyId} AND i.code = s.item_cd
        AND i.name = '' AND s.item_name <> ''
      RETURNING i.id`) as any[];
    itemNames += n1.length;
    const n2 = (await sql`
      UPDATE suppliers sp SET name = s.supplier_name, updated_at = NOW()
      FROM ${src}
      WHERE sp.company_id = ${companyId} AND sp.code = s.supplier_cd
        AND sp.name = '' AND s.supplier_name <> ''
      RETURNING sp.id`) as any[];
    supplierNames += n2.length;
  }
  return { updated, unmatched: Math.max(0, rows.length - updated), itemNames, supplierNames };
}

/** 申請に含まれる取引先CDの一覧（添付の閲覧権限チェック用） */
export async function requestSupplierCodes(
  companyId: string,
  requestId: string
): Promise<string[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT supplier_cd FROM price_request_lines
    WHERE company_id = ${companyId} AND request_id = ${requestId} AND supplier_cd <> ''`;
  return (rows as any[]).map((r) => r.supplier_cd as string);
}

/** 添付ファイルが属する申請ID（company スコープ内） */
export async function requestIdOfFile(
  companyId: string,
  fileId: string
): Promise<string | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT request_id FROM request_files
    WHERE company_id = ${companyId} AND id = ${fileId} LIMIT 1`;
  return (rows as any[])[0]?.request_id ?? null;
}

export async function addRequestFile(
  companyId: string,
  requestId: string,
  file: {
    fileName: string;
    contentType: string;
    data: Buffer;
    kind?: string;
    uploadedBy: string | null;
    uploadedName: string | null;
  }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO request_files (
      company_id, request_id, file_name, content_type, size_bytes, kind, data, uploaded_by, uploaded_name)
    VALUES (${companyId}, ${requestId}, ${file.fileName}, ${file.contentType},
            ${file.data.length}, ${file.kind ?? "quote"}, ${file.data},
            ${file.uploadedBy}, ${file.uploadedName})`;
}

/** 添付の本体を取得（ダウンロード用） */
export async function getRequestFile(
  companyId: string,
  fileId: string
): Promise<{ fileName: string; contentType: string; data: Buffer } | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT file_name, content_type, data FROM request_files
    WHERE company_id = ${companyId} AND id = ${fileId} LIMIT 1`;
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    fileName: r.file_name,
    contentType: r.content_type ?? "application/octet-stream",
    data: Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data),
  };
}

export async function deleteRequestFile(companyId: string, fileId: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM request_files WHERE company_id = ${companyId} AND id = ${fileId}`;
}
