import { getSql } from "./neon";
import { ensureSchema } from "./schema";
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
    reason: r.reason ?? null,
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
    if (!l.supplierCd) throw new Error(`明細${i + 1}: 発注先CDは必須です`);
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
      current_price, new_price, paid_supply_price,
      bd_supply_mat, bd_material, bd_revision, bd_design, bd_forex, bd_other,
      reason_note, tax_cd, wg_cd
    )
    SELECT ${companyId}, ${requestId}, x.seq, x.item_cd, x.item_branch, x.item_name,
           x.supplier_cd, x.supplier_name, x.loc_cd, x.loc_name, x.dlv_cd, x.dlv_name,
           x.unit_cd, x.lot_qty, x.currency, x.start_date::date, x.end_date::date,
           x.current_price, x.new_price, x.paid_supply_price,
           x.bd_supply_mat, x.bd_material, x.bd_revision, x.bd_design, x.bd_forex, x.bd_other,
           x.reason_note, x.tax_cd, x.wg_cd
    FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS x(
      seq int, item_cd text, item_branch text, item_name text,
      supplier_cd text, supplier_name text, loc_cd text, loc_name text, dlv_cd text, dlv_name text,
      unit_cd text, lot_qty double precision, currency text, start_date text, end_date text,
      current_price double precision, new_price double precision, paid_supply_price double precision,
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
  const rows = await sql`
    UPDATE price_requests SET
      status = 'pending',
      submitted_at = NOW(),
      updated_at = NOW(),
      applicant_login_id = COALESCE(applicant_login_id, ${actor.loginId}),
      applicant_name = COALESCE(applicant_name, ${actor.name}),
      req_no = COALESCE(req_no,
        (SELECT COALESCE(MAX(req_no), 0) + 1 FROM price_requests WHERE company_id = ${companyId}))
    WHERE company_id = ${companyId} AND id = ${requestId} AND status IN ('draft', 'rejected')
    RETURNING id`;
  if ((rows as any[]).length === 0) throw new Error("提出できませんでした（状態を確認してください）");
  await addRequestMessage(companyId, requestId, actor, "申請を提出しました。", true);
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
  const from = stage === "mgr" ? "pending" : "mgr_approved";
  const to = stage === "mgr" ? "mgr_approved" : "approved";
  const rows = await sql`
    UPDATE price_requests SET status = ${to}, updated_at = NOW()
    WHERE company_id = ${companyId} AND id = ${requestId} AND status = ${from}
    RETURNING id`;
  if ((rows as any[]).length === 0)
    throw new Error("承認できませんでした（既に処理済みか、承認段階が一致しません）");
  await sql`
    INSERT INTO request_approvals (company_id, request_id, stage, action, approver_login_id, approver_name, comment)
    VALUES (${companyId}, ${requestId}, ${stage}, 'approve', ${approver.loginId}, ${approver.name}, ${comment})`;
  const stageLabel = stage === "mgr" ? "MGR" : "部門長";
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
  const from = stage === "mgr" ? "pending" : "mgr_approved";
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
 * 同一キー（品目CD・枝番・発注先CD・納入場所CD・納品先CD）の直前の適用中レコードは
 * 新適用開始日の前日で適用終了に更新し、新しい行を末尾（適用終了 2099/12/31）として追加する。
 */
async function applyApprovedToHistory(companyId: string, requestId: string): Promise<void> {
  const sql = getSql();
  const lines = await sql`
    SELECT * FROM price_request_lines
    WHERE company_id = ${companyId} AND request_id = ${requestId} ORDER BY seq`;
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
        start_date, end_date, price, price_before, tax_cd, reason, source, request_line_id
      ) VALUES (
        ${companyId}, ${l.item_cd}, ${l.item_branch}, ${l.item_name}, ${l.supplier_cd}, ${l.supplier_name},
        ${l.unit_cd}, ${l.lot_qty}, ${l.currency}, ${l.loc_cd}, ${l.dlv_cd}, ${l.wg_cd},
        ${l.start_date}, ${l.end_date}, ${l.new_price}, ${l.current_price}, ${l.tax_cd},
        ${l.reason_note}, 'approval', ${l.id}
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

// ===== 単価履歴 =====

export async function listPrices(
  companyId: string,
  opts: {
    q?: string | null;
    supplierCd?: string | null;
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
  supplierCd: string | null
): Promise<PriceHistoryRow[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM price_history
    WHERE company_id = ${companyId} AND item_cd = ${itemCd}
      AND (${supplierCd}::text IS NULL OR supplier_cd = ${supplierCd})
    ORDER BY supplier_cd, COALESCE(loc_cd, '*'), COALESCE(dlv_cd, '*'), start_date DESC
    LIMIT 1000`;
  return (rows as any[]).map(mapHistory);
}

/**
 * 現行単価の自動取得（申請フォーム用）。
 * 指定日時点で適用中の単価を、キー（品目・枝番・発注先・納入場所）で検索する。
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
    sql`
      SELECT * FROM items
      WHERE company_id = ${companyId}
        AND (${q}::text IS NULL OR code ILIKE ${q} OR name ILIKE ${q})
      ORDER BY code, branch LIMIT ${limit} OFFSET ${offset}`,
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
    })),
    total: Number((cnt as any)[0]?.n ?? 0),
  };
}

export async function upsertItem(
  companyId: string,
  item: { code: string; branch?: string | null; name: string; unitCd?: string | null; taxCd?: string | null; notes?: string | null }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const branch = (item.branch ?? "").trim() || "*";
  await sql`
    INSERT INTO items (company_id, code, branch, name, unit_cd, tax_cd, notes)
    VALUES (${companyId}, ${item.code.trim()}, ${branch}, ${item.name.trim()},
            ${item.unitCd ?? null}, ${item.taxCd ?? null}, ${item.notes ?? null})
    ON CONFLICT (company_id, code, branch) DO UPDATE SET
      name = EXCLUDED.name,
      unit_cd = COALESCE(EXCLUDED.unit_cd, items.unit_cd),
      tax_cd = COALESCE(EXCLUDED.tax_cd, items.tax_cd),
      notes = COALESCE(EXCLUDED.notes, items.notes),
      active = true,
      updated_at = NOW()`;
}

export async function deleteItem(companyId: string, id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM items WHERE company_id = ${companyId} AND id = ${id}`;
}

export async function listSuppliers(
  companyId: string,
  opts: { q?: string | null; limit?: number; offset?: number } = {}
): Promise<{ rows: Supplier[]; total: number }> {
  await ensureSchema();
  const sql = getSql();
  const limit = Math.min(opts.limit ?? 100, 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = opts.q ? `%${opts.q}%` : null;
  const [rows, cnt] = await Promise.all([
    sql`
      SELECT * FROM suppliers
      WHERE company_id = ${companyId}
        AND (${q}::text IS NULL OR code ILIKE ${q} OR name ILIKE ${q})
      ORDER BY code LIMIT ${limit} OFFSET ${offset}`,
    sql`
      SELECT COUNT(*)::int AS n FROM suppliers
      WHERE company_id = ${companyId}
        AND (${q}::text IS NULL OR code ILIKE ${q} OR name ILIKE ${q})`,
  ]);
  return {
    rows: (rows as any[]).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      notes: r.notes ?? null,
      active: Boolean(r.active),
    })),
    total: Number((cnt as any)[0]?.n ?? 0),
  };
}

export async function upsertSupplier(
  companyId: string,
  s: { code: string; name: string; notes?: string | null }
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO suppliers (company_id, code, name, notes)
    VALUES (${companyId}, ${s.code.trim()}, ${s.name.trim()}, ${s.notes ?? null})
    ON CONFLICT (company_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      notes = COALESCE(EXCLUDED.notes, suppliers.notes),
      active = true,
      updated_at = NOW()`;
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
    SELECT ${companyId}, x.item_cd, x.item_branch, x.supplier_cd, x.unit_cd, x.lot_qty, x.currency,
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
    SELECT DISTINCT ${companyId}, x.item_cd, COALESCE(x.item_branch, '*'), ''
    FROM ${recordset}
    ON CONFLICT (company_id, code, branch) DO NOTHING`;
  await sql`
    INSERT INTO suppliers (company_id, code, name)
    SELECT DISTINCT ${companyId}, x.supplier_cd, ''
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

export interface ExportableLine extends PriceRequestLine {
  reqNo: number | null;
  approvedAt: string | null;
}

/** 出力対象の承認済み明細（未出力 or すべて） */
export async function listExportableLines(
  companyId: string,
  opts: { includeExported?: boolean; limit?: number } = {}
): Promise<ExportableLine[]> {
  await ensureSchema();
  const sql = getSql();
  const includeExported = opts.includeExported ?? false;
  const limit = Math.min(opts.limit ?? 1000, 5000);
  const rows = await sql`
    SELECT l.*, r.req_no,
      (SELECT MAX(a.created_at) FROM request_approvals a
       WHERE a.request_id = r.id AND a.stage = 'dept' AND a.action = 'approve') AS approved_at
    FROM price_request_lines l
    JOIN price_requests r ON r.id = l.request_id
    WHERE l.company_id = ${companyId} AND r.status = 'approved'
      AND (${includeExported} OR l.exported_at IS NULL)
    ORDER BY r.req_no, l.seq
    LIMIT ${limit}`;
  return (rows as any[]).map((r) => ({
    ...mapLine(r),
    reqNo: r.req_no ?? null,
    approvedAt: r.approved_at ? tsStr(r.approved_at) : null,
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
