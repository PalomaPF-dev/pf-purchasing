import { getSql } from "./neon";
import { ensureAuthSchema } from "./authDb";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * DDL を実行するが、「既に存在する」系のエラーは無視する。
 * Postgres の CREATE INDEX/TABLE IF NOT EXISTS は同時実行に対して安全ではなく、
 * 複数リクエストが初回に同時に走ると pg_class のユニーク制約違反(23505/42P07/42710)で
 * 失敗しうる。冪等な初期化として、これらは握り潰す。
 */
async function safeDdl(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (e: any) {
    const code = e?.code ?? e?.sourceError?.code;
    if (code === "42P07" || code === "42710" || code === "23505") return;
    throw e;
  }
}

let schemaReady: Promise<void> | null = null;

/**
 * 購買単価管理のドメインテーブルを冪等に作成。
 * - suppliers            … 取引先（発注先）マスタ
 * - items                … 品番（品目）マスタ
 * - price_requests       … 単価申請ヘッダ（承認ワークフローの単位）
 * - price_request_lines  … 単価申請明細（承認用紙1枚＝1明細）
 * - request_approvals    … 承認ログ（MGR/部門長の各段階）
 * - request_messages     … 承認スレッド（申請者⇄承認者のメッセージ）
 * - price_history        … 単価履歴（改訂履歴）（mcframe からの移行＋承認反映）
 *
 * 認証テーブル（companies/users）も同時に用意する。
 * 同一プロセス内の同時呼び出しは1回の実行に集約（共有プロミス）。失敗時は次回再試行できるよう解除。
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = buildSchema().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

async function buildSchema(): Promise<void> {
  const sql = getSql();

  await ensureAuthSchema();

  // 取引先（発注先）マスタ
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS suppliers (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code       TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      notes      TEXT,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, code)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS suppliers_company_idx ON suppliers(company_id)`);

  // 品番（品目）マスタ。branch は mcframe の枝番1（既定 '*'＝枝番なし）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS items (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      code       TEXT NOT NULL,
      branch     TEXT NOT NULL DEFAULT '*',
      name       TEXT NOT NULL DEFAULT '',
      unit_cd    TEXT,
      tax_cd     TEXT,
      notes      TEXT,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, code, branch)
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS items_company_idx ON items(company_id)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS items_code_idx ON items(company_id, code)`);

  // 単価申請ヘッダ（1申請＝複数明細可。承認W/Fの単位）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS price_requests (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      req_no             INTEGER,
      title              TEXT,
      status             TEXT NOT NULL DEFAULT 'draft',
      applicant_login_id TEXT,
      applicant_name     TEXT,
      submitted_at       TIMESTAMPTZ,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS price_requests_company_status_idx ON price_requests(company_id, status, created_at DESC)`);
  await safeDdl(() => sql`CREATE UNIQUE INDEX IF NOT EXISTS price_requests_req_no_idx ON price_requests(company_id, req_no)`);

  // 単価申請明細（承認用紙「単価申請内訳」1枚＝1明細）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS price_request_lines (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      request_id        UUID NOT NULL REFERENCES price_requests(id) ON DELETE CASCADE,
      seq               INTEGER NOT NULL DEFAULT 1,
      item_cd           TEXT NOT NULL,
      item_branch       TEXT,
      item_name         TEXT,
      supplier_cd       TEXT NOT NULL,
      supplier_name     TEXT,
      loc_cd            TEXT,
      loc_name          TEXT,
      dlv_cd            TEXT,
      dlv_name          TEXT,
      unit_cd           TEXT,
      lot_qty           DOUBLE PRECISION,
      currency          TEXT DEFAULT 'JPY',
      start_date        DATE NOT NULL,
      end_date          DATE DEFAULT '2099-12-31',
      current_price     DOUBLE PRECISION,
      new_price         DOUBLE PRECISION NOT NULL,
      paid_supply_price DOUBLE PRECISION,
      bd_supply_mat     DOUBLE PRECISION,
      bd_material       DOUBLE PRECISION,
      bd_revision       DOUBLE PRECISION,
      bd_design         DOUBLE PRECISION,
      bd_forex          DOUBLE PRECISION,
      bd_other          DOUBLE PRECISION,
      reason_note       TEXT,
      tax_cd            TEXT DEFAULT 'P0010',
      wg_cd             TEXT DEFAULT 'WG00',
      exported_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS price_request_lines_request_idx ON price_request_lines(request_id, seq)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS price_request_lines_company_idx ON price_request_lines(company_id)`);

  // 承認ログ（stage: mgr=MGR、dept=部門長。action: approve/reject）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS request_approvals (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      request_id        UUID NOT NULL REFERENCES price_requests(id) ON DELETE CASCADE,
      stage             TEXT NOT NULL,
      action            TEXT NOT NULL,
      approver_login_id TEXT,
      approver_name     TEXT,
      comment           TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS request_approvals_request_idx ON request_approvals(request_id, created_at)`);

  // 承認スレッド（申請者⇄承認者のメッセージ・システムメッセージ）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS request_messages (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      request_id      UUID NOT NULL REFERENCES price_requests(id) ON DELETE CASCADE,
      author_login_id TEXT,
      author_name     TEXT,
      body            TEXT NOT NULL,
      is_system       BOOLEAN NOT NULL DEFAULT false,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS request_messages_request_idx ON request_messages(request_id, created_at)`);

  // 単価履歴（改訂履歴）（mcframe の購買単価に相当。移行データ＋承認反映で積み上がる）
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS price_history (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      item_cd         TEXT NOT NULL,
      item_branch     TEXT,
      item_name       TEXT,
      supplier_cd     TEXT NOT NULL,
      supplier_name   TEXT,
      unit_cd         TEXT,
      lot_qty         DOUBLE PRECISION,
      currency        TEXT,
      loc_cd          TEXT,
      dlv_cd          TEXT,
      wg_cd           TEXT,
      start_date      DATE NOT NULL,
      end_date        DATE,
      price           DOUBLE PRECISION NOT NULL,
      price_before    DOUBLE PRECISION,
      tax_cd          TEXT,
      reason          TEXT,
      source          TEXT NOT NULL DEFAULT 'approval',
      request_line_id UUID REFERENCES price_request_lines(id) ON DELETE SET NULL,
      memo1           TEXT,
      memo2           TEXT,
      memo3           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  // 単価差の要因（改訂理由別の内訳）。承認時に申請明細から転記し、履歴として残す。
  // 移行データには存在しないため NULL 許容。reason（備考）と合わせて改訂理由の記録になる。
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS bd_supply_mat DOUBLE PRECISION`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS bd_material DOUBLE PRECISION`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS bd_revision DOUBLE PRECISION`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS bd_design DOUBLE PRECISION`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS bd_forex DOUBLE PRECISION`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS bd_other DOUBLE PRECISION`);
  // 申請情報（誰の・どの申請による改訂か）を履歴からたどれるようにする
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS req_no INTEGER`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS applicant_name TEXT`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS price_history_item_idx ON price_history(company_id, item_cd, supplier_cd, start_date DESC)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS price_history_supplier_idx ON price_history(company_id, supplier_cd, start_date DESC)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS price_history_start_idx ON price_history(company_id, start_date DESC)`);

  // パスワード設定（招待）トークン
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON password_reset_tokens(token_hash)`);
}
