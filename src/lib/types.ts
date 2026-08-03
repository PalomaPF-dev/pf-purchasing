// ===== ドメイン型（PF購買単価） =====

/**
 * 申請ステータス。
 * draft=下書き → pending → （バイヤー確認が有効なら buyer_approved）→ mgr_approved → approved
 * pending は「バイヤー確認待ち」または「MGR承認待ち」のどちらか
 * （申請者に承認バイヤーが割り当てられているかで決まる）。
 */
export type RequestStatus =
  | "draft"
  | "pending"
  | "buyer_approved"
  | "mgr_approved"
  | "approved"
  | "rejected";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "下書き",
  pending: "承認待ち",
  buyer_approved: "MGR承認待ち",
  mgr_approved: "部門長承認待ち",
  approved: "承認済",
  rejected: "差し戻し",
};

/** 承認段階。buyer=バイヤー確認（任意）、mgr=MGR（課長）、dept=部門長 */
export type ApprovalStage = "buyer" | "mgr" | "dept";

export const APPROVAL_STAGE_LABEL: Record<ApprovalStage, string> = {
  buyer: "バイヤー",
  mgr: "MGR",
  dept: "部門長",
};

/** 申請ヘッダ */
export interface PriceRequest {
  id: string;
  reqNo: number | null;
  /** 表示用の申請番号（採番ルールを適用した文字列）。未提出は null */
  reqCode: string | null;
  title: string | null;
  status: RequestStatus;
  applicantLoginId: string | null;
  applicantName: string | null;
  submittedAt: string | null;
  createdAt: string;
  lineCount?: number;
  supplierSummary?: string | null;
}

/** 申請明細（承認用紙1枚に対応） */
export interface PriceRequestLine {
  id: string;
  requestId: string;
  seq: number;
  itemCd: string;
  itemBranch: string | null;
  itemName: string | null;
  supplierCd: string;
  supplierName: string | null;
  locCd: string | null;
  locName: string | null;
  dlvCd: string | null;
  dlvName: string | null;
  unitCd: string | null;
  lotQty: number | null;
  currency: string | null;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  currentPrice: number | null; // 現行単価
  newPrice: number; // 購入単価
  paidSupplyPrice: number | null; // 有償支給価格
  monthlyQty: number | null; // 月当たり数量（単価改訂の影響額計算用）
  bdSupplyMat: number | null; // 支給材建値
  bdMaterial: number | null; // 材料建値
  bdRevision: number | null; // 単価改定
  bdDesign: number | null; // 設計変更
  bdForex: number | null; // 為替変動
  bdOther: number | null; // その他
  reasonNote: string | null; // 備考（改訂理由）
  taxCd: string | null;
  wgCd: string | null;
  exportedAt: string | null;
}

/** 明細の入力値（フォーム/取込共通） */
export interface LineInput {
  itemCd: string;
  itemBranch?: string | null;
  itemName?: string | null;
  supplierCd: string;
  supplierName?: string | null;
  locCd?: string | null;
  locName?: string | null;
  dlvCd?: string | null;
  dlvName?: string | null;
  unitCd?: string | null;
  lotQty?: number | null;
  currency?: string | null;
  startDate: string;
  endDate?: string | null;
  currentPrice?: number | null;
  newPrice: number;
  paidSupplyPrice?: number | null;
  monthlyQty?: number | null;
  bdSupplyMat?: number | null;
  bdMaterial?: number | null;
  bdRevision?: number | null;
  bdDesign?: number | null;
  bdForex?: number | null;
  bdOther?: number | null;
  reasonNote?: string | null;
  taxCd?: string | null;
  wgCd?: string | null;
}

/** 承認ログ */
export interface RequestApproval {
  id: string;
  stage: ApprovalStage;
  action: "approve" | "reject";
  approverLoginId: string | null;
  approverName: string | null;
  comment: string | null;
  createdAt: string;
}

/** 承認スレッドのメッセージ */
export interface RequestMessage {
  id: string;
  authorLoginId: string | null;
  authorName: string | null;
  body: string;
  isSystem: boolean;
  createdAt: string;
}

/** 単価履歴の1行 */
export interface PriceHistoryRow {
  id: string;
  itemCd: string;
  itemBranch: string | null;
  itemName: string | null;
  supplierCd: string;
  supplierName: string | null;
  unitCd: string | null;
  lotQty: number | null;
  currency: string | null;
  locCd: string | null;
  dlvCd: string | null;
  wgCd: string | null;
  startDate: string;
  endDate: string | null;
  price: number;
  priceBefore: number | null;
  taxCd: string | null;
  /** 月当たり数量（単価改訂の影響額計算用） */
  monthlyQty: number | null;
  /** 備考（改訂理由の記述） */
  reason: string | null;
  /** 単価差の要因（改訂理由別の内訳）。移行データは null */
  bdSupplyMat: number | null;
  bdMaterial: number | null;
  bdRevision: number | null;
  bdDesign: number | null;
  bdForex: number | null;
  bdOther: number | null;
  /** どの申請による改訂か（移行データは null） */
  reqNo: number | null;
  applicantName: string | null;
  approvedAt: string | null;
  source: "migration" | "approval";
  requestLineId: string | null;
  createdAt: string;
  /** 納入場所マスタの名称（履歴には持たず、表示時に連携して補う） */
  locName: string | null;
}

/** 品番マスタ */
export interface Item {
  id: string;
  code: string;
  branch: string | null;
  name: string;
  unitCd: string | null;
  taxCd: string | null;
  notes: string | null;
  active: boolean;
  /** 科目CD */
  acctCd?: string | null;
  /** 科目名 */
  acctName?: string | null;
  /** 科目内訳 */
  acctDetail?: string | null;
  /** 借方ICS科目名（製造） */
  icsName?: string | null;
  /** 品目区分 */
  itemClass?: string | null;
  /** 材料区分 */
  materialClass?: string | null;
  /** このアプリに登録した日 */
  createdAt?: string | null;
  /** 単価履歴の最新行から求めた現在の取引先 */
  currentSupplierCd?: string | null;
  currentSupplierName?: string | null;
  /** その単価の適用開始日 */
  currentStartDate?: string | null;
}

/** 取引先マスタ */
export interface Supplier {
  id: string;
  code: string;
  name: string;
  notes: string | null;
  active: boolean;
  /** 担当バイヤー（企画グループ主担当）の社員番号。null = 未割当 */
  buyerLoginId: string | null;
  /** 担当バイヤーの副担当（企画グループ括弧書き）の社員番号 */
  buyerSubLoginId?: string | null;
  /** チェイサー（管理グループ）の社員番号 */
  chaserLoginId?: string | null;
  /** 社員マスタから引いた担当者の氏名（表示用） */
  buyerName?: string | null;
  buyerSubName?: string | null;
  chaserName?: string | null;
}
