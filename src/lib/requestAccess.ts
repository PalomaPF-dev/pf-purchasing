import { canAccessSupplier, requestSupplierCodes } from "./db";
import { supplierScopeOf, type AppSession } from "./session";

/**
 * 申請（とその添付資料）を扱えるかを判定する。
 * 管理者は全件。一般（バイヤー）は、その申請に自分の担当発注先が含まれている場合のみ。
 * 明細がまだ無い下書きは、作成者本人だけが扱える。
 */
export async function canAccessRequest(
  session: AppSession,
  requestId: string,
  applicantLoginId?: string | null
): Promise<boolean> {
  const scope = supplierScopeOf(session);
  if (!scope.restricted) return true;
  if (applicantLoginId && session.loginId && applicantLoginId === session.loginId) return true;
  const codes = await requestSupplierCodes(session.companyId, requestId);
  if (codes.length === 0) return false;
  for (const code of codes) {
    if (await canAccessSupplier(session.companyId, code, scope.buyerLoginId)) return true;
  }
  return false;
}
