import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSql } from "@/lib/neon";
import { ensureSchema } from "@/lib/schema";
import { approvalQueueFor } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ポータル集計用API（内部用・UIなし）。
 * 認証は provision API と同じ共有キー PF_PROVISION_KEY（未設定なら 503 で無効化）。
 *
 * POST /api/approvals/summary
 * body: { key: string, loginId?: string }
 * → { pending: number, total: number, scoped: boolean }
 *
 * loginId を渡すと、その人が**いま自分で承認できる**件数だけを返す。
 * （自分より前の段階で止まっている申請＝他の人の承認待ちは数えない。
 *   承認画面に出る件数と一致する。承認画面は管理者権限のため、
 *   一般権限のユーザーは 0 を返す。）
 * loginId を渡さない場合は従来どおり全体の承認待ち件数（pending + mgr_approved）を返す。
 */

/** タイミング安全なキー比較（長さ違いは即 false 扱い）。 */
function safeKeyEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** 社員番号からユーザーの会社と権限を引く（未登録なら null）。 */
async function userOf(loginId: string): Promise<{ companyId: string; role: string } | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT company_id, COALESCE(role, 'member') AS role FROM users
    WHERE login_id = ${loginId} LIMIT 1`) as { company_id: string; role: string }[];
  if (!rows[0]) return null;
  return { companyId: rows[0].company_id, role: rows[0].role };
}

export async function POST(req: Request) {
  const provisionKey = process.env.PF_PROVISION_KEY;
  if (!provisionKey) {
    return NextResponse.json({ message: "provision未設定" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key : "";
  if (!safeKeyEqual(key, provisionKey)) {
    return NextResponse.json({ message: "認証に失敗しました。" }, { status: 401 });
  }
  const loginId = typeof body.loginId === "string" ? body.loginId.trim() : "";

  try {
    await ensureSchema();
    const sql = getSql();
    const totalRows = (await sql`
      SELECT COUNT(*)::int AS n FROM price_requests
      WHERE status IN ('pending', 'buyer_approved', 'mgr_approved')`) as { n: number }[];
    const total = Number(totalRows[0]?.n ?? 0);

    if (!loginId) {
      // 呼び出し元が誰の分か指定していない場合は、従来どおり全体の件数
      return NextResponse.json({ pending: total, total, scoped: false });
    }

    const user = await userOf(loginId);
    // 承認画面は管理者のみ。承認できない人には出さない
    if (!user || user.role !== "admin") {
      return NextResponse.json({ pending: 0, total, scoped: true });
    }
    const queue = await approvalQueueFor(user.companyId, loginId);
    const pending = queue.buyer.length + queue.mgr.length + queue.dept.length;
    return NextResponse.json({ pending, total, scoped: true });
  } catch (err) {
    console.error("[approvals/summary] error:", err);
    return NextResponse.json({ message: "集計に失敗しました。" }, { status: 500 });
  }
}

/** GET など他メソッドは非対応。 */
export function GET() {
  return NextResponse.json({ message: "Method Not Allowed" }, { status: 405 });
}
