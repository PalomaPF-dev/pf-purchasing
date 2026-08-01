# PF購買単価

購入品単価の登録・承認・改訂履歴を管理する社内システム（Palomaシリーズ）。
mcframe（基幹システム）への取込データ出力までを一気通貫でカバーします。

- **単価申請** — 発注先を選んでから、その取引先の品目を検索して単価を登録申請（品名・単位・現行単価は自動補完）。単価差の内訳（支給材建値・材料建値・単価改定・設計変更・為替変動・その他）と改訂理由を記録
- **承認ワークフロー** — 申請 → MGR承認 → 部門長承認 の2段階。差し戻し・コメントスレッド対応
- **単価申請書（PDF）** — 現行の紙帳票「登録品単価連絡書」の様式。1行＝1品番で新単価（適用日・単価・支給単価・買入単価）と旧単価（取消日・単価・買入単価）を左右に対比。承認欄（部門長・MGR・担当）つきでブラウザ印刷からPDF出力
- **見積書AI取込** — 見積書（Excel/PDF/画像）を Claude が読み取り、プレビューで確認・修正してから申請明細へ反映（複数ファイル一括・PF品質管理/PF設備管理と同仕様）
- **一括取込** — Excel/CSV から単価申請の明細・品番マスタ・取引先マスタを一括登録（テンプレートDL付き）
- **MC取込CSV出力** — 部門長承認済みの単価を mcframe の購買単価取込フォーマット（52列・1行目=項目キー/2行目=日本語ラベル）で出力。**更新は適用日・単価・改訂前単価のみで、他の項目は現行の登録値を維持**。申請詳細からの単票出力・出力済み管理つき
- **単価履歴** — 品目×取引先×納入場所ごとの適用履歴を時系列表示。単価差の要因（支給材建値・材料建値・単価改定・設計変更・為替変動・その他）と備考、申請No・申請者も記録として保持
- **データ移行** — mcframe からエクスポートした単価情報（21万行規模）をブラウザから分割送信で取込（冪等・再実行可）

## 技術構成

- Next.js (App Router) + Tailwind CSS 4 — 他のPalomaシリーズと同一パターン
- Neon Postgres（`DATABASE_URL`）/ next-auth（社員番号ログイン・JWT）
- `@paloma-pf/ui` 共通シェル / ポータルSSO・一括アカウント発行（`PF_PROVISION_KEY`）
- Anthropic API（見積書AI読み取り）/ exceljs（Excel取込）

## 本番環境

- URL: https://purchasing.paloma-pf.com （ポータル https://portal.paloma-pf.com からSSOで起動）
- ポータル側の登録: pf-portal（アプリキー `purchasing`）

## 開発

```bash
npm install
npm run dev   # http://localhost:5183
```

### 環境変数（.env.local）

| 変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | Neon Postgres（購買単価専用DB） |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | next-auth（本番は `https://purchasing.paloma-pf.com`） |
| `PF_ADMIN_BOOTSTRAP_HASH` | 統一管理者（login_id=admin）の bcrypt ハッシュ（任意） |
| `PF_PROVISION_KEY` | ポータルSSO・一括アカウント発行の共有キー（ポータルと同一値を設定） |
| `ANTHROPIC_API_KEY` | 見積書AI取込（未設定時は該当機能のみ無効） |

DBスキーマはアプリ起動時に冪等に自動作成されます（マイグレーション不要）。

## 初期セットアップの流れ

1. 環境変数を設定してデプロイ（Vercel）または `npm run dev`
2. `/register` で最初の管理者を作成（`PF_ADMIN_BOOTSTRAP_HASH` を設定した場合は `admin` でログイン可）
3. **品番マスタ・取引先マスタ**を一括取込（`/import` → テンプレートDL → 取込）
4. **データ移行**（`/migrate`）: mcframe の単価情報エクスポート（Excel）を「CSV UTF-8」で保存し、そのままアップロード
   - 論理削除行（del_flg≠0）は自動スキップ。再実行しても二重登録されません
   - 移行後「マスタから名称を補完する」を実行すると履歴に品名・取引先名が入ります
5. 以後は「単価申請 → 承認 → MC取込出力」の運用サイクル

## MC取込CSVの仕様

`MC取込フォーマット.xlsx` と同一の列構成で出力します。

- 1行目: 項目キー（`del_flg, wg_cd, … itm_p.itm_cd, … upri1_p.upri, …`）
- 2行目: 日本語ラベル（論理削除、ワーキンググループＣＤ、…）
- 3行目以降: データ（適用開始日/終了日は `YYYYMMDD`、単価=`upri1_p.upri`、改訂前単価=`upri2_p.upri`）
- 文字コード: UTF-8（BOM付き・Excel対応）。Shift_JIS が必要な場合は Excel 等で変換してください
