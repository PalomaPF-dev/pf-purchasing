import ExcelJS from "exceljs";

/**
 * Excel（.xlsx/.xlsm）を「シート見出し＋タブ区切り行」のテキストに変換する。
 * レイアウト自由の帳票をAIに解釈させるための共通処理（PF品質管理・PF設備管理と同方式）。
 */

/** テキスト化の上限（トークン超過を防ぐ。見積書なら通常この1/10以下） */
const MAX_TEXT_CHARS = 150_000;

export async function workbookToText(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const parts: string[] = [];
  let total = 0;
  for (const ws of wb.worksheets) {
    if (ws.state === "hidden" || ws.state === "veryHidden") continue;
    const lines: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        cells.push(valueToText(cell.value));
      });
      const line = cells.join("\t").replace(/\t+$/, "");
      if (line.trim() !== "") lines.push(line);
    });
    if (lines.length === 0) continue;
    const block = `=== シート: ${ws.name} ===\n${lines.join("\n")}`;
    total += block.length;
    parts.push(block);
    if (total > MAX_TEXT_CHARS) {
      parts.push("（※ 以降のシートはサイズ上限のため省略。ファイルを分割して取り込んでください）");
      break;
    }
  }
  let text = parts.join("\n\n");
  if (text.length > MAX_TEXT_CHARS) {
    text =
      text.slice(0, MAX_TEXT_CHARS) +
      "\n（※ 以降はサイズ上限のため省略。ファイルを分割して取り込んでください）";
  }
  return text;
}

/** セル値を表示用テキストへ（数式は計算結果、リッチテキストは連結、日付は YYYY-MM-DD）。 */
function valueToText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.replace(/[\t\r\n]+/g, " ").trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText
        .map((r) => r.text)
        .join("")
        .replace(/[\t\r\n]+/g, " ")
        .trim();
    }
    if ("text" in v && v.text != null) return valueToText(v.text as ExcelJS.CellValue);
    if ("result" in v && v.result != null) return valueToText(v.result as ExcelJS.CellValue);
    if ("error" in v) return "";
  }
  return "";
}
