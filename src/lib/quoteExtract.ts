import Anthropic from "@anthropic-ai/sdk";

/**
 * 見積書（PDF/画像）→ 単価申請明細 のAI抽出。
 * tool use（強制呼び出し）で型安全に構造化し、申請フォームへの自動入力に使う。
 */

export interface QuoteItem {
  itemCd: string | null;
  itemName: string | null;
  unitPrice: number;
  unit: string | null;
  lotQty: number | null;
  notes: string | null;
}

export interface QuoteResult {
  supplierCd: string | null;
  supplierName: string | null;
  quoteDate: string | null; // YYYY-MM-DD
  effectiveDate: string | null; // YYYY-MM-DD
  currency: string | null;
  items: QuoteItem[];
}

const EXTRACT_TOOL = {
  name: "extract_quote",
  description: "見積書から取引先情報と品目ごとの見積単価を抽出して構造化する。",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      supplierName: { type: ["string", "null"], description: "見積元（取引先）の会社名" },
      supplierCd: {
        type: ["string", "null"],
        description: "取引先コードが記載されていれば（例: 00906）。無ければ null",
      },
      quoteDate: { type: ["string", "null"], description: "見積日（YYYY-MM-DD）。無ければ null" },
      effectiveDate: {
        type: ["string", "null"],
        description: "適用開始日・価格改定日が記載されていれば（YYYY-MM-DD）。無ければ null",
      },
      currency: { type: ["string", "null"], description: "通貨（JPY/USD等）。記載なしは null" },
      items: {
        type: "array",
        description: "見積の品目行（すべて）",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            itemCd: {
              type: ["string", "null"],
              description: "品番・品目コード（例: 097384000）。無ければ null",
            },
            itemName: { type: ["string", "null"], description: "品名" },
            unitPrice: { type: "number", description: "見積単価（数値）" },
            unit: { type: ["string", "null"], description: "単位（個・kg 等）。無ければ null" },
            lotQty: { type: ["number", "null"], description: "ロット数・最低発注数量。無ければ null" },
            notes: { type: ["string", "null"], description: "備考（材質・条件等）。無ければ null" },
          },
          required: ["itemCd", "itemName", "unitPrice", "unit", "lotQty", "notes"],
        },
      },
    },
    required: ["supplierName", "supplierCd", "quoteDate", "effectiveDate", "currency", "items"],
  },
} as const;

const SYSTEM_PROMPT = `あなたは製造業の購買部門の専門家です。渡された見積書を読み取り、取引先情報と品目ごとの見積単価を正確に構造化してください。

読み取りのポイント:
- 見積単価は税抜の単価を使います（税込しか無い場合はその値を使い notes に「税込」と記載）。
- 品番・品目コードらしき記載（数字列・型式）があれば itemCd に入れます。
- 数量割引などで単価が複数ある場合は、代表的な（基準ロットの）単価を使い、他は notes に記載します。
- 読み取れない項目は無理に埋めず null にします。推測で数値を作らないでください。
- 必ず extract_quote ツールを1回呼び出して結果を返してください。`;

/**
 * Claude に見積書（PDF または画像）を渡して抽出する。
 * 読み取り結果が空のときは items が空配列（呼び出し側で 422 にする）。API エラーは throw。
 */
export async function extractQuote(content: Anthropic.ContentBlockParam[]): Promise<QuoteResult> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [EXTRACT_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "extract_quote" },
    messages: [{ role: "user", content }],
  });

  const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const raw = (toolUse?.input ?? {}) as Record<string, unknown>;
  const s = (v: unknown): string | null => {
    const t = typeof v === "string" ? v.trim() : "";
    return t === "" ? null : t;
  };
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const d = (v: unknown): string | null => {
    const t = s(v);
    if (!t) return null;
    const m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return null;
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  };

  const itemsRaw = Array.isArray(raw.items) ? (raw.items as Array<Record<string, unknown>>) : [];
  const items: QuoteItem[] = [];
  for (const it of itemsRaw) {
    const price = num(it.unitPrice);
    if (price == null) continue;
    items.push({
      itemCd: s(it.itemCd),
      itemName: s(it.itemName),
      unitPrice: price,
      unit: s(it.unit),
      lotQty: num(it.lotQty),
      notes: s(it.notes),
    });
  }
  return {
    supplierCd: s(raw.supplierCd),
    supplierName: s(raw.supplierName),
    quoteDate: d(raw.quoteDate),
    effectiveDate: d(raw.effectiveDate),
    currency: s(raw.currency),
    items,
  };
}
