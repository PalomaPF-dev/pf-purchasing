import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session";
import { extractQuote } from "@/lib/quoteExtract";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 120;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/**
 * 見積書（PDF/画像）を Claude の文書認識で読み取り、単価申請の明細に構造化して返す。
 * 申請フォームの「見積書から自動入力」で使用。結果はフォームで確認・修正してから申請する前提。
 */
export async function POST(req: Request): Promise<NextResponse> {
  const session = await getSessionWithRole();
  if (!session?.companyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI取り込みが未設定です（ANTHROPIC_API_KEY 未設定）。管理者にお問い合わせください。" },
      { status: 503 }
    );
  }

  let body: { fileBase64?: string; contentType?: string; fileName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const fileBase64 = (body.fileBase64 ?? "").replace(/^data:.*?;base64,/, "").replace(/\s/g, "");
  if (!fileBase64) {
    return NextResponse.json({ error: "ファイルデータがありません" }, { status: 400 });
  }
  // 32MB上限（base64は約1.37倍）
  if (fileBase64.length > 30 * 1024 * 1024) {
    return NextResponse.json({ error: "ファイルが大きすぎます（32MBまで）" }, { status: 413 });
  }
  const contentType = body.contentType ?? "application/pdf";

  const source: Anthropic.ContentBlockParam =
    contentType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : IMAGE_TYPES.includes(contentType as (typeof IMAGE_TYPES)[number])
        ? {
            type: "image",
            source: {
              type: "base64",
              media_type: contentType as (typeof IMAGE_TYPES)[number],
              data: fileBase64,
            },
          }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } };

  try {
    const quote = await extractQuote([
      source,
      {
        type: "text",
        text: "この見積書を読み取り、extract_quote ツールで発注先と品目ごとの見積単価を構造化してください。",
      },
    ]);
    if (quote.items.length === 0) {
      return NextResponse.json(
        { error: "見積書から品目を読み取れませんでした。手入力で登録してください。" },
        { status: 422 }
      );
    }
    return NextResponse.json({ quote });
  } catch (e) {
    console.error("[import-quote]", e);
    const msg = e instanceof Error ? e.message : "AI読み取りに失敗しました";
    return NextResponse.json({ error: `AI読み取りに失敗しました: ${msg}` }, { status: 502 });
  }
}
