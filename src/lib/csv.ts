// ===== CSV 生成ユーティリティ =====

type Cell = string | number | null | undefined;

/** 1セルを CSV エスケープ。先頭が =,+,-,@ の場合は数式インジェクション対策で ' を前置。 */
function escapeCell(value: Cell): string {
  let s = value == null ? "" : String(value);
  // CSV インジェクション（Excel 等で数式として評価される）対策
  if (/^[=+@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** MC取込用: エスケープのみ（数式インジェクション前置なし。基幹取込データを汚さない） */
function escapeCellRaw(value: Cell): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const BOM = String.fromCharCode(0xfeff); // Excel(日本語)の文字化け防止

/** ヘッダ＋行を CSV 文字列に。改行は CRLF、UTF-8 BOM 付き。 */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeCell).join(","));
  return BOM + lines.join("\r\n");
}

/** 複数ヘッダ行（MC取込フォーマット等）対応・エスケープのみの CSV。 */
export function toCsvRaw(rows: Cell[][]): string {
  const lines = rows.map((r) => r.map(escapeCellRaw).join(","));
  return BOM + lines.join("\r\n");
}

/**
 * シンプルな CSV パーサ（ダブルクォート対応・CRLF/LF 両対応）。
 * 一括取込・移行取込のブラウザ/サーバ共用。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuote = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuote) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuote = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
