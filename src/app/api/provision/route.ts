import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createInvitedUser, ensureAuthSchema, getOrCreateCompanyByName } from "@/lib/authDb";
import { getSql } from "@/lib/neon";
import { ensureSchema } from "@/lib/schema";
import { generateResetToken, hashResetToken, resetLinkBase } from "@/lib/passwordReset";

export const runtime = "nodejs";

/**
 * ポータルからの一括アカウント発行API（内部用・UIなし）。
 * 認証はセッションではなく共有キー PF_PROVISION_KEY（未設定なら 503 で無効化）。
 * 複数ユーザーをまとめて発行してパスワード設定リンクを返す。PF家族共通パターン。
 */

// 招待リンクの有効期限は7日
const INVITE_TOKEN_TTL_MINUTES = 7 * 24 * 60;
// 1リクエストで発行できる上限件数
const MAX_USERS_PER_REQUEST = 200;
// 発行先の会社（統一管理者ブートストラップと同じ固定値）
const PROVISION_COMPANY_NAME = "株式会社パロマ";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// 社員番号は半角英数字とハイフン・アンダースコアのみ（1〜64文字）
const isLoginId = (s: string) => /^[A-Za-z0-9_-]{1,64}$/.test(s);

/** タイミング安全なキー比較（長さ違いは即 false 扱い）。 */
function safeKeyEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type ProvisionResult = {
  loginId: string;
  status: "created" | "exists" | "error";
  passwordSet?: boolean;
  inviteUrl?: string;
  message?: string;
};

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

  const users = body.users;
  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ message: "users を指定してください。" }, { status: 400 });
  }
  if (users.length > MAX_USERS_PER_REQUEST) {
    return NextResponse.json(
      { message: `一度に発行できるのは最大${MAX_USERS_PER_REQUEST}件です。` },
      { status: 400 }
    );
  }
  const regenerateLinks = body.regenerateLinks === true;

  try {
    await ensureAuthSchema();
    await ensureSchema();
    const companyId = await getOrCreateCompanyByName(PROVISION_COMPANY_NAME);
    const sql = getSql();

    const results: ProvisionResult[] = [];
    for (const u of users) {
      const loginId = (u?.loginId ?? "").toString().trim();
      try {
        if (!isLoginId(loginId)) {
          results.push({
            loginId,
            status: "error",
            message: "社員番号は半角英数字とハイフン・アンダースコア（1〜64文字）で入力してください。",
          });
          continue;
        }
        if (loginId === "admin") {
          results.push({ loginId, status: "error", message: "社員番号 'admin' は発行できません。" });
          continue;
        }
        const name = (u?.name ?? "").toString().trim();
        const email = ((u?.email ?? "").toString().trim().toLowerCase() as string) || null;
        const role: "admin" | "member" = u?.role === "admin" ? "admin" : "member";
        const approverLoginId: string | null = (u?.approverLoginId ?? "").toString().trim() || null;
        if (email && (!isEmail(email) || email.length > 254)) {
          results.push({ loginId, status: "error", message: "メールアドレスの形式が正しくありません。" });
          continue;
        }

        // 既存ユーザー: ポータル側の編集を反映。設定リンクは regenerateLinks のときだけ再発行
        const existing = await sql`SELECT id, pending FROM users WHERE login_id = ${loginId} LIMIT 1`;
        if (existing.length > 0) {
          const userId = existing[0].id as string;
          await sql`
            UPDATE users SET
              name = COALESCE(NULLIF(${name}, ''), name),
              role = ${role},
              approver_login_id = ${approverLoginId},
              email = COALESCE(${email}, email)
            WHERE id = ${userId}`;
          if (!regenerateLinks) {
            results.push({ loginId, status: "exists", passwordSet: !existing[0].pending });
            continue;
          }
          const token = generateResetToken();
          await sql`
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
            VALUES (${userId}, ${hashResetToken(token)},
                    NOW() + make_interval(mins => ${INVITE_TOKEN_TTL_MINUTES}))`;
          results.push({
            loginId,
            status: "exists",
            passwordSet: !existing[0].pending,
            inviteUrl: `${resetLinkBase()}/password-reset/confirm?token=${token}`,
          });
          continue;
        }

        if (!name) {
          results.push({ loginId, status: "error", message: "お名前を入力してください。" });
          continue;
        }

        // 新規発行: 招待ユーザー作成 → 設定リンク発行
        const userId = await createInvitedUser(companyId, loginId, name, role, email, approverLoginId);
        const token = generateResetToken();
        await sql`
          INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
          VALUES (${userId}, ${hashResetToken(token)},
                  NOW() + make_interval(mins => ${INVITE_TOKEN_TTL_MINUTES}))`;
        const inviteUrl = `${resetLinkBase()}/password-reset/confirm?token=${token}`;
        results.push({ loginId, status: "created", passwordSet: false, inviteUrl });
      } catch (e) {
        results.push({ loginId, status: "error", message: (e as Error).message });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[provision] error:", err);
    return NextResponse.json({ message: "一括発行に失敗しました。" }, { status: 500 });
  }
}
