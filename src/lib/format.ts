// ===== 表示フォーマット（日付・金額） =====

/** YYYY-MM-DD / Date / ISO文字列 → YYYY/MM/DD */
export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const s = v instanceof Date ? v.toISOString() : String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  return s;
}

/** ISO文字列 → YYYY/MM/DD HH:mm（JST） */
export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}/${p(jst.getUTCMonth() + 1)}/${p(jst.getUTCDate())} ${p(
    jst.getUTCHours()
  )}:${p(jst.getUTCMinutes())}`;
}

/** 今日（JST）を YYYY-MM-DD で返す */
export function todayJST(): string {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}-${p(jst.getUTCMonth() + 1)}-${p(jst.getUTCDate())}`;
}

/** 単価表示（小数は最大4桁・不要な0は省く。null は — ） */
export function formatPrice(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const rounded = Math.round(v * 10000) / 10000;
  return rounded.toLocaleString("ja-JP", { maximumFractionDigits: 4 });
}

/** 差額表示（+/-つき） */
export function formatDiff(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const s = formatPrice(Math.abs(v));
  if (v > 0) return `+${s}`;
  if (v < 0) return `-${s}`;
  return "0";
}

/** YYYY-MM-DD → YYYYMMDD（MC取込用） */
export function toYmd8(v: string | null | undefined): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}
