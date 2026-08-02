import { del, get, put } from "@vercel/blob";

/**
 * 機密ファイル（見積書・稟議資料）の保管先。
 *
 * Vercel Blob の **Private** ストア（pf-project-private）を使う。
 * Public ストアと違い、URL を知っていても読めない（トークンが要る）。
 * したがってダウンロードは必ずこのアプリを経由し、
 * 既存の権限チェック（canAccessRequest）を通したうえで
 * サーバーが取得してユーザーへ中継する。Blob の URL は画面に出さない。
 *
 * 環境変数 PRIVATE_BLOB_READ_WRITE_TOKEN は Vercel の
 * ストア接続（カスタムプレフィックス PRIVATE_BLOB）で自動設定される。
 * 公開ストア pf-project の BLOB_READ_WRITE_TOKEN とは別物なので混同しないこと。
 */

/** 他アプリと同じ区画分け。統一ストア上でこのアプリの領域を示す。 */
const APP_PREFIX = "purchasing";

export function privateBlobToken(): string | undefined {
  return process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
}

/** Blob が使える構成か（未設定なら従来どおり DB 保存にフォールバックする） */
export function isPrivateBlobConfigured(): boolean {
  return Boolean(privateBlobToken());
}

/** パスの各セグメントをサニタイズ（パストラバーサル・不正文字の遮断） */
function sanitize(seg: string): string {
  return seg.replace(/[^\w.\-]/g, "_").slice(0, 120) || "file";
}

/**
 * 添付を Private ストアへ保存し、URL を返す。
 * パスは purchasing/<companyId>/<requestId>/<時刻>_<ファイル名> で、
 * addRandomSuffix により推測不能な URL になる。
 */
export async function putRequestFile(opts: {
  companyId: string;
  requestId: string;
  fileName: string;
  contentType: string;
  body: Buffer;
}): Promise<string> {
  const token = privateBlobToken();
  if (!token) throw new Error("PRIVATE_BLOB_READ_WRITE_TOKEN が未設定です");
  const key = [
    APP_PREFIX,
    sanitize(opts.companyId),
    sanitize(opts.requestId),
    `${Date.now()}_${sanitize(opts.fileName)}`,
  ].join("/");
  const blob = await put(key, opts.body, {
    access: "private",
    token,
    contentType: opts.contentType || "application/octet-stream",
    addRandomSuffix: true,
  });
  return blob.url;
}

/** Private ストアから本体を取得（ダウンロード中継用） */
export async function fetchPrivateBlob(url: string): Promise<Buffer | null> {
  const token = privateBlobToken();
  if (!token) return null;
  const res = await get(url, { access: "private", token });
  if (!res?.stream) return null;
  const chunks: Uint8Array[] = [];
  // @ts-expect-error Web ReadableStream は for await に対応する（Node 18+）
  for await (const c of res.stream) chunks.push(c as Uint8Array);
  return Buffer.concat(chunks);
}

/** 添付削除時に実体も消す。失敗しても業務は止めない（ログのみ）。 */
export async function deletePrivateBlob(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const token = privateBlobToken();
  if (!token) return;
  try {
    await del(url, { token });
  } catch (e) {
    console.error("[privateBlob] delete failed:", e);
  }
}
