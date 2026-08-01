import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSql } from "@/lib/neon";
import { ensureSchema } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ポータル集計用API（内部用・UIなし）。
 * 認証は provision API と同じ共有キー PF_PROVISION_KEY（未設定なら 503 で無効化）。
 * 承認待ちの単価申請（pending=MGR承認待ち + mgr_approved=部門長承認待ち）の総数を返す。
 *
 * POST /api/approvals/summary
 * body: { key: string }
 * → { pending: number }
 */

/** タイミング安全なキー比較（長さ違いは即 false 扱い）。 */
function safeKeyEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
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

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT COUNT(*)::int AS n FROM price_requests
      WHERE status IN ('pending', 'mgr_approved')`;
    return NextResponse.json({ pending: Number(rows[0]?.n ?? 0) });
  } catch (err) {
    console.error("[approvals/summary] error:", err);
    return NextResponse.json({ message: "集計に失敗しました。" }, { status: 500 });
  }
}

/** GET など他メソッドは非対応。 */
export function GET() {
  return NextResponse.json({ message: "Method Not Allowed" }, { status: 405 });
}
