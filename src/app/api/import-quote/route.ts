import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/lib/session";
import { extractQuote } from "@/lib/quoteExtract";
import { workbookToText } from "@/lib/xlsxText";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 120;

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/**
 * 見積書（PDF・画像・Excel）を Claude で読み取り、単価申請の明細に構造化して返す。
 * PF品質管理・PF設備管理の帳票取り込みと同方式：
 * - PDF/画像は document/image ブロックとしてそのまま渡す（スキャン画像も可）
 * - Excel(.xlsx/.xlsm) はサーバーでタブ区切りテキストに変換してから渡す
 * 結果はフォームのプレビューで確認・修正してから明細へ反映する前提。
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

  let body: { fileBase64?: string; xlsxBase64?: string; contentType?: string; fileName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const fileName = body.fileName ?? "";
  const xlsxBase64 = (body.xlsxBase64 ?? "").replace(/^data:.*?;base64,/, "").replace(/\s/g, "");
  const fileBase64 = (body.fileBase64 ?? "").replace(/^data:.*?;base64,/, "").replace(/\s/g, "");

  let content: Anthropic.ContentBlockParam[];

  if (xlsxBase64) {
    // ---- Excel（.xlsx/.xlsm）: サーバーでテキスト化してから渡す ----
    // 20MB上限（base64は約1.37倍）
    if (xlsxBase64.length > 28 * 1024 * 1024) {
      return NextResponse.json({ error: "Excelファイルが大きすぎます（20MBまで）" }, { status: 413 });
    }
    let sheetText: string;
    try {
      sheetText = await workbookToText(Buffer.from(xlsxBase64, "base64"));
    } catch (e) {
      console.error("[import-quote] xlsx parse", e);
      return NextResponse.json(
        {
          error:
            "Excelファイルを開けませんでした。.xlsx 形式（旧 .xls はExcelで .xlsx に保存し直し）かご確認ください。",
        },
        { status: 422 }
      );
    }
    if (!sheetText.trim()) {
      return NextResponse.json(
        { error: "Excelに読み取れる内容がありませんでした。手入力で登録してください。" },
        { status: 422 }
      );
    }
    content = [
      {
        type: "text",
        text: `以下は見積書Excel「${fileName}」の内容です。シートごとに「=== シート: 名前 ===」で区切り、各行はセルをタブで区切っています。\n\n${sheetText}`,
      },
      {
        type: "text",
        text: "この見積書を読み取り、extract_quote ツールで発注先と品目ごとの見積単価を構造化してください。複数シート・複数品目があればすべて含めてください。",
      },
    ];
  } else {
    // ---- PDF / 画像 ----
    if (!fileBase64) {
      return NextResponse.json({ error: "ファイルデータがありません" }, { status: 400 });
    }
    // 32MB上限（base64は約1.37倍）
    if (fileBase64.length > 30 * 1024 * 1024) {
      return NextResponse.json({ error: "ファイルが大きすぎます（32MBまで）" }, { status: 413 });
    }
    const contentType = body.contentType ?? "application/pdf";
    const source: Anthropic.ContentBlockParam = IMAGE_TYPES.includes(
      contentType as (typeof IMAGE_TYPES)[number]
    )
      ? {
          type: "image",
          source: {
            type: "base64",
            media_type: contentType as (typeof IMAGE_TYPES)[number],
            data: fileBase64,
          },
        }
      : {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
        };
    content = [
      source,
      {
        type: "text",
        text: "この見積書を読み取り、extract_quote ツールで発注先と品目ごとの見積単価を構造化してください。",
      },
    ];
  }

  try {
    const quote = await extractQuote(content);
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
