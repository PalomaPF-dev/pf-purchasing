import crypto from "crypto";
import bcrypt from "bcryptjs";
import { getSql } from "./neon";

/**
 * ユーザーの役割。admin=管理者（承認・マスタ管理・取込/出力が可能）、member=一般（申請・閲覧）。
 * PF家族共通の users/companies モデル（社員番号 login_id でログイン）。
 */
export type UserRole = "admin" | "member";

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  admin: "管理者",
  member: "一般",
};

/** 認証用テーブル（companies/users）を冪等に作成。空DBでも自動初期化されるようにする。 */
export async function ensureAuthSchema(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      email         TEXT UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'member',
      login_id      TEXT,
      pending       BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  await sql`CREATE INDEX IF NOT EXISTS users_company_id_idx ON users(company_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_idx ON users(login_id)`;
  // 指定承認者（承認ルーティング用）。NULL=担当指定なし（全管理者が承認可）。
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS approver_login_id TEXT`;
  // 統一管理者（login_id='admin'）のブートストラップ
  await ensureAdminBootstrap();
}

/** 実運用の会社名（統一管理者の所属先）。 */
const BOOTSTRAP_COMPANY_NAME = "株式会社パロマ";

/** 実運用の会社を名前で get-or-create して id を返す（最古の同名会社に寄せる）。 */
export async function getOrCreateCompanyByName(name: string): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    SELECT id FROM companies WHERE name = ${name}
    ORDER BY created_at ASC LIMIT 1`;
  const existing = rows[0]?.id as string | undefined;
  if (existing) return existing;
  const created = await sql`INSERT INTO companies (name) VALUES (${name}) RETURNING id`;
  return created[0].id as string;
}

/**
 * 統一管理者ブートストラップ（冪等）。
 * login_id='admin' のユーザーが居ない場合のみ、環境変数 PF_ADMIN_BOOTSTRAP_HASH
 * （bcrypt ハッシュ）が設定されていれば「株式会社パロマ」＋管理者ユーザーを作成する。
 */
async function ensureAdminBootstrap(): Promise<void> {
  const hash = (process.env.PF_ADMIN_BOOTSTRAP_HASH ?? "").trim();
  if (!hash) return;
  const sql = getSql();
  const admin = await sql`SELECT 1 FROM users WHERE login_id = 'admin' LIMIT 1`;
  if (admin.length > 0) return;
  const companyId = await getOrCreateCompanyByName(BOOTSTRAP_COMPANY_NAME);
  await sql`
    INSERT INTO users (company_id, login_id, email, name, password_hash, role, pending)
    VALUES (${companyId}, 'admin', ${null}, ${"管理者"}, ${hash}, 'admin', false)
    ON CONFLICT DO NOTHING`;
}

/** 社員番号（login_id）重複チェック */
export async function loginIdExists(loginId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`SELECT 1 FROM users WHERE login_id = ${loginId} LIMIT 1`;
  return rows.length > 0;
}

/** 全体の管理者（role='admin'）の数。初期セットアップ判定に使う。 */
export async function countAllAdmins(): Promise<number> {
  const sql = getSql();
  const rows = await sql`SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'`;
  return Number(rows[0]?.n ?? 0);
}

/** ユーザーを作成（パスワードは bcrypt でハッシュ化）。初期セットアップの初期ユーザーは admin。 */
export async function createUser(
  companyId: string,
  loginId: string,
  name: string,
  password: string,
  role: UserRole = "admin",
  email: string | null = null
): Promise<void> {
  const sql = getSql();
  const passwordHash = await bcrypt.hash(password, 12);
  await sql`
    INSERT INTO users (company_id, login_id, email, name, password_hash, role)
    VALUES (${companyId}, ${loginId}, ${email}, ${name}, ${passwordHash}, ${role})
  `;
}

/**
 * 招待ユーザーを作成（pending=true）。ログインできないランダムなハッシュを設定し、
 * パスワードは招待リンク（/password-reset/confirm）から本人が設定する。作成したIDを返す。
 */
export async function createInvitedUser(
  companyId: string,
  loginId: string,
  name: string,
  role: UserRole,
  email: string | null = null,
  approverLoginId: string | null = null
): Promise<string> {
  const sql = getSql();
  const passwordHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12);
  const rows = await sql`
    INSERT INTO users (company_id, login_id, email, name, password_hash, role, pending, approver_login_id)
    VALUES (${companyId}, ${loginId}, ${email}, ${name}, ${passwordHash}, ${role}, true, ${approverLoginId})
    RETURNING id
  `;
  return rows[0].id as string;
}

/** 会社内の特定ユーザーの役割を返す（存在しなければ null）。 */
export async function getUserRole(companyId: string, userId: string): Promise<UserRole | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT role FROM users WHERE company_id = ${companyId} AND id = ${userId} LIMIT 1`;
  if (!rows[0]) return null;
  return ((rows[0] as { role: string | null }).role ?? "member") as UserRole;
}
