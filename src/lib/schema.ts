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
 * - suppliers            … 取引先マスタ
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

  // 取引先マスタ
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
  // 担当バイヤー（社員番号 = users.login_id）。一般ユーザーは自分の担当取引先のみ
  // 閲覧・申請できる。NULL = 未割当（管理者のみが扱える）。
  await safeDdl(() => sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS buyer_login_id TEXT`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS suppliers_buyer_idx ON suppliers(company_id, buyer_login_id)`);
  // 担当窓口（取引先CDと窓口一覧より）。
  // buyer_login_id = 企画グループ担当（バイヤー）、buyer_sub_login_id = 併記された副担当、
  // chaser_login_id = 管理グループ担当（チェイサー）。
  // 単価マスタ登録はチェイサーが入力しバイヤーが承認する運用のため、
  // この3者はいずれもその取引先を扱える。
  await safeDdl(() => sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS buyer_sub_login_id TEXT`);
  await safeDdl(() => sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS chaser_login_id TEXT`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS suppliers_chaser_idx ON suppliers(company_id, chaser_login_id)`);

  // 納入場所マスタ（納入場所CD → 名称）。
  // 単価は品目×取引先×納入場所ごとに登録されるため、CDだけでは分かりにくい画面表示を
  // 名称で補う。移行データ・単価改訂履歴の取込時にも自動で登録する。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS locations (
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
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS locations_company_idx ON locations(company_id)`);

  // 社員マスタ（社員一覧）。アプリのユーザー登録の元になる。
  // wf_role: 'mgr' | 'dept' | null（承認W/Fの段階）。role: 'admin' | 'member'
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS employees (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      login_id   TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      wf_role    TEXT,
      role       TEXT NOT NULL DEFAULT 'member',
      email      TEXT,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (company_id, login_id)
    )`);
  // このユーザーの申請を承認する担当者（社員番号）。MGRが複数いる場合の割当に使う。
  // 未設定なら、承認W/Fで MGR / 部門長 に指定された全員が承認できる。
  // 承認バイヤー（MGR承認の前に確認する同じグループのバイヤー）。未設定ならこの段階は無い。
  await safeDdl(() => sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS buyer_login_id TEXT`);
  await safeDdl(() => sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS mgr_login_id TEXT`);
  await safeDdl(() => sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS dept_login_id TEXT`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS employees_company_idx ON employees(company_id)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS employees_name_idx ON employees(company_id, name)`);

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
  // mcframe の品目マスタ項目（科目・品目区分など）
  await safeDdl(() => sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS acct_cd TEXT`);
  await safeDdl(() => sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS acct_name TEXT`);
  await safeDdl(() => sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS acct_detail TEXT`);
  await safeDdl(() => sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS ics_name TEXT`);
  await safeDdl(() => sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS item_class TEXT`);
  await safeDdl(() => sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS material_class TEXT`);

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
  // 単価改訂の影響額を出すための月当たり数量
  await safeDdl(() => sql`ALTER TABLE price_request_lines ADD COLUMN IF NOT EXISTS monthly_qty DOUBLE PRECISION`);
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
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS monthly_qty DOUBLE PRECISION`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS req_no INTEGER`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS applicant_name TEXT`);
  await safeDdl(() => sql`ALTER TABLE price_history ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS price_history_item_idx ON price_history(company_id, item_cd, supplier_cd, start_date DESC)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS price_history_supplier_idx ON price_history(company_id, supplier_cd, start_date DESC)`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS price_history_start_idx ON price_history(company_id, start_date DESC)`);

  // 申請の添付資料（見積書・稟議資料など）。承認後は単価履歴からも参照できる。
  // ファイル本体は Postgres に保持する（Blobストレージの追加設定なしで運用するため）。
  // 1ファイル4MBまで（Vercel のリクエストボディ上限に合わせる）。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS request_files (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      request_id   UUID NOT NULL REFERENCES price_requests(id) ON DELETE CASCADE,
      file_name    TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes   INTEGER NOT NULL DEFAULT 0,
      kind         TEXT NOT NULL DEFAULT 'quote',
      data         BYTEA NOT NULL,
      uploaded_by  TEXT,
      uploaded_name TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await safeDdl(() => sql`CREATE INDEX IF NOT EXISTS request_files_request_idx ON request_files(request_id, created_at)`);

  // 承認ワークフローの設定（管理者が画面から変更する）。会社ごとに1行。
  // stages: 1=MGRのみ / 2=MGR→部門長。approvers が空配列なら全管理者が承認できる。
  await safeDdl(() => sql`
    CREATE TABLE IF NOT EXISTS wf_settings (
      company_id     UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      stages         INTEGER NOT NULL DEFAULT 2,
      mgr_approvers  TEXT[] NOT NULL DEFAULT '{}',
      dept_approvers TEXT[] NOT NULL DEFAULT '{}',
      mgr_label      TEXT NOT NULL DEFAULT 'MGR',
      dept_label     TEXT NOT NULL DEFAULT '部門長',
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  // 申請番号の採番ルール（書式と連番のリセット単位）
  await safeDdl(() => sql`ALTER TABLE wf_settings ADD COLUMN IF NOT EXISTS buyer_label TEXT`);
  await safeDdl(() => sql`ALTER TABLE wf_settings ADD COLUMN IF NOT EXISTS req_format TEXT`);
  await safeDdl(() => sql`ALTER TABLE wf_settings ADD COLUMN IF NOT EXISTS req_reset TEXT`);
  // 採番結果。req_no は会社内で一意の通番、req_seq はリセット単位内の連番、
  // req_code は書式を適用した表示用の申請番号。
  await safeDdl(() => sql`ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS req_seq INTEGER`);
  await safeDdl(() => sql`ALTER TABLE price_requests ADD COLUMN IF NOT EXISTS req_code TEXT`);

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
