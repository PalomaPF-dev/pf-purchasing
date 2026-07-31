import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getSql } from "./neon";
import { ensureSchema } from "./schema";

// ===== パスワード設定（招待）トークン。ポータル一括発行(provision)の招待リンクで使用 =====

/** ランダムトークンを生成（URLセーフ） */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** トークンは平文保存せずハッシュで照合する */
export function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** 招待リンクのベースURL（NEXTAUTH_URL → VERCEL_URL → localhost の順） */
export function resetLinkBase(): string {
  const base =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:5183";
  return base.replace(/\/$/, "");
}

/**
 * トークンを検証してパスワードを設定する（招待完了・pending 解除）。
 * 成功なら null、失敗なら理由メッセージを返す。
 */
export async function confirmPasswordReset(token: string, password: string): Promise<string | null> {
  if (password.length < 8) return "パスワードは8文字以上で設定してください。";
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT t.id, t.user_id, t.expires_at, t.used_at
    FROM password_reset_tokens t
    WHERE t.token_hash = ${hashResetToken(token)}
    LIMIT 1`;
  const t = rows[0] as
    | { id: string; user_id: string; expires_at: string | Date; used_at: string | null }
    | undefined;
  if (!t) return "リンクが無効です。管理者に再発行を依頼してください。";
  if (t.used_at) return "このリンクは使用済みです。管理者に再発行を依頼してください。";
  if (new Date(t.expires_at).getTime() < Date.now())
    return "リンクの有効期限が切れています。管理者に再発行を依頼してください。";
  const hash = await bcrypt.hash(password, 12);
  await sql`UPDATE users SET password_hash = ${hash}, pending = false WHERE id = ${t.user_id}`;
  await sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${t.id}`;
  return null;
}
