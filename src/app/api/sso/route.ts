import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { encode } from "next-auth/jwt";
import {
  createInvitedUser,
  ensureAuthSchema,
  getOrCreateCompanyByName,
} from "@/lib/authDb";
import { getSql } from "@/lib/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ポータルからのSSOログインAPI。
 * ポータルは PF_PROVISION_KEY で署名した短命トークン（60秒）を付けてリダイレクトしてくる。
 * トークン検証に成功したら、Credentials ログインと同じ内容の next-auth セッション JWT を
 * 発行してクッキーにセットし、トップへリダイレクトする（パスワード不要）。
 * pending（パスワード未設定）ユーザーもポータル経由ならログイン可能とする。
 */

// このアプリのキー（トークンの app と一致必須）
const APP_KEY = "purchasing";
// セッション寿命は next-auth の既定（30日）に合わせる
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
// 初回SSO時に自動作成するユーザーの所属会社（provision API と同じ固定値）
const PROVISION_COMPANY_NAME = "株式会社パロマ";

/**
 * 検証失敗時は理由を漏らさずログイン画面へ（詳細はサーバーログのみ）。
 * reason は Vercel のログで原因を切り分けるために記録する（レスポンスには含めない）。
 */
function ssoFail(req: NextRequest, reason: string): NextResponse {
  console.warn(`[sso] failed: ${reason}`);
  return NextResponse.redirect(new URL("/login?error=sso", req.nextUrl), 302);
}

/** タイミング安全な比較（長さ違いは即 false 扱い） */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const provisionKey = process.env.PF_PROVISION_KEY;
  if (!provisionKey) {
    return NextResponse.json({ message: "SSO未設定" }, { status: 503 });
  }

  const raw = req.nextUrl.searchParams.get("token") ?? "";
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return ssoFail(req, "token形式が不正");
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);

  // 署名検証（payload 文字列に対する HMAC-SHA256 の小文字hex）
  const expected = createHmac("sha256", provisionKey).update(payload).digest("hex");
  if (!safeEqual(sig, expected)) {
    return ssoFail(req, "署名不一致（PF_PROVISION_KEY がポータルと異なる可能性）");
  }

  // ペイロード検証（loginId / app / exp。exp は epoch ms、発行から60秒有効）
  let data: { loginId?: unknown; app?: unknown; exp?: unknown };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return ssoFail(req, "payloadのJSON解析に失敗");
  }
  const loginId = typeof data.loginId === "string" ? data.loginId.trim() : "";
  if (!loginId) return ssoFail(req, "loginIdが空");
  if (data.app !== APP_KEY) return ssoFail(req, `app不一致（受信: ${String(data.app)}）`);
  if (typeof data.exp !== "number" || !(data.exp > Date.now())) {
    return ssoFail(req, "トークン期限切れ（サーバー時刻のずれの可能性）");
  }

  try {
    // authorize と同様、スキーマを冪等に整えてから検索する（一時失敗では止めない）
    try {
      await ensureAuthSchema();
    } catch {
      /* noop */
    }

    // 社員番号（login_id）でユーザー特定。pending でもログイン可（パスワードは触らない）。
    const sql = getSql();
    const findUser = () => sql`
      SELECT u.id, u.login_id, u.email, u.name, u.role,
             c.id AS company_id, c.name AS company_name
      FROM users u
      JOIN companies c ON c.id = u.company_id
      WHERE u.login_id = ${loginId}
      LIMIT 1`;
    let rows = await findUser();
    if (rows.length === 0) {
      // 未発行ユーザーの自動作成（初回SSO）。
      // トークンは共有キー PF_PROVISION_KEY による署名済みで、ポータル側が
      // 「このユーザーの部署に購買単価が含まれる」ことを確認した上でのみ発行する。
      // よって provision API と同じ信頼水準であり、ここで作成してよい。
      // 氏名・役割はポータルの一括発行（/api/provision）で後から正となる値に更新される。
      console.warn("[sso] user not found, auto-provisioning:", loginId);
      const companyId = await getOrCreateCompanyByName(PROVISION_COMPANY_NAME);
      await createInvitedUser(companyId, loginId, loginId, "member");
      rows = await findUser();
    }
    const user = rows[0];
    if (!user) {
      return ssoFail(req, `ユーザー自動作成に失敗: ${loginId}`);
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return ssoFail(req, "NEXTAUTH_SECRET 未設定");
    }

    const useSecureCookies =
      (process.env.NEXTAUTH_URL ?? "").startsWith("https://") || process.env.VERCEL === "1";
    const cookieName = `${useSecureCookies ? "__Secure-" : ""}purchasing.session-token`;

    // Credentials ログインの jwt コールバックと同じクレームを持つセッションを発行
    const token = await encode({
      token: {
        id: user.id as string,
        sub: user.id as string,
        name: user.name as string,
        email: (user.email ?? null) as string | null,
        companyId: user.company_id as string,
        companyName: user.company_name as string,
        role: (user.role ?? "member") as "admin" | "member",
        loginId: (user.login_id ?? null) as string | null,
      },
      secret,
      maxAge: SESSION_MAX_AGE,
    });

    const res = NextResponse.redirect(new URL("/", req.nextUrl), 302);
    res.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: useSecureCookies,
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (e) {
    console.error("[sso] error:", e);
    return ssoFail(req, `例外: ${e instanceof Error ? e.message : String(e)}`);
  }
}
