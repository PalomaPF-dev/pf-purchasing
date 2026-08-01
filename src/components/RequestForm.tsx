"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { createRequestAction, updateRequestAction } from "@/lib/actions";
import type { LineInput, PriceRequestLine } from "@/lib/types";

/** フォーム上の明細行（文字列で保持し、送信時に数値化） */
interface FormLine {
  itemCd: string;
  itemBranch: string;
  itemName: string;
  supplierCd: string;
  supplierName: string;
  locCd: string;
  locName: string;
  dlvCd: string;
  dlvName: string;
  unitCd: string;
  lotQty: string;
  currency: string;
  startDate: string;
  endDate: string;
  currentPrice: string;
  newPrice: string;
  paidSupplyPrice: string;
  bdSupplyMat: string;
  bdMaterial: string;
  bdRevision: string;
  bdDesign: string;
  bdForex: string;
  bdOther: string;
  reasonNote: string;
}

function emptyLine(startDate: string): FormLine {
  return {
    itemCd: "",
    itemBranch: "",
    itemName: "",
    supplierCd: "",
    supplierName: "",
    locCd: "",
    locName: "",
    dlvCd: "",
    dlvName: "",
    unitCd: "",
    lotQty: "",
    currency: "JPY",
    startDate,
    endDate: "2099-12-31",
    currentPrice: "",
    newPrice: "",
    paidSupplyPrice: "",
    bdSupplyMat: "",
    bdMaterial: "",
    bdRevision: "",
    bdDesign: "",
    bdForex: "",
    bdOther: "",
    reasonNote: "",
  };
}

function fromExisting(l: PriceRequestLine): FormLine {
  const s = (v: string | null | undefined) => v ?? "";
  const n = (v: number | null | undefined) => (v == null ? "" : String(v));
  return {
    itemCd: l.itemCd,
    itemBranch: s(l.itemBranch),
    itemName: s(l.itemName),
    supplierCd: l.supplierCd,
    supplierName: s(l.supplierName),
    locCd: s(l.locCd),
    locName: s(l.locName),
    dlvCd: s(l.dlvCd),
    dlvName: s(l.dlvName),
    unitCd: s(l.unitCd),
    lotQty: n(l.lotQty),
    currency: s(l.currency) || "JPY",
    startDate: l.startDate,
    endDate: s(l.endDate) || "2099-12-31",
    currentPrice: n(l.currentPrice),
    newPrice: n(l.newPrice),
    paidSupplyPrice: n(l.paidSupplyPrice),
    bdSupplyMat: n(l.bdSupplyMat),
    bdMaterial: n(l.bdMaterial),
    bdRevision: n(l.bdRevision),
    bdDesign: n(l.bdDesign),
    bdForex: n(l.bdForex),
    bdOther: n(l.bdOther),
    reasonNote: s(l.reasonNote),
  };
}

function toNum(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toPayload(lines: FormLine[]): LineInput[] {
  return lines.map((l) => ({
    itemCd: l.itemCd,
    itemBranch: l.itemBranch || null,
    itemName: l.itemName || null,
    supplierCd: l.supplierCd,
    supplierName: l.supplierName || null,
    locCd: l.locCd || null,
    locName: l.locName || null,
    dlvCd: l.dlvCd || null,
    dlvName: l.dlvName || null,
    unitCd: l.unitCd || null,
    lotQty: toNum(l.lotQty),
    currency: l.currency || "JPY",
    startDate: l.startDate,
    endDate: l.endDate || null,
    currentPrice: toNum(l.currentPrice),
    newPrice: toNum(l.newPrice) ?? NaN,
    paidSupplyPrice: toNum(l.paidSupplyPrice),
    bdSupplyMat: toNum(l.bdSupplyMat),
    bdMaterial: toNum(l.bdMaterial),
    bdRevision: toNum(l.bdRevision),
    bdDesign: toNum(l.bdDesign),
    bdForex: toNum(l.bdForex),
    bdOther: toNum(l.bdOther),
    reasonNote: l.reasonNote || null,
  }));
}

/** 差額（購入単価 − 現行単価）。片方未入力なら null */
function diffOf(l: FormLine): number | null {
  const cur = toNum(l.currentPrice);
  const nw = toNum(l.newPrice);
  if (cur == null || nw == null) return null;
  return Math.round((nw - cur) * 10000) / 10000;
}

/** 内訳合計 */
function bdSum(l: FormLine): number | null {
  const vals = [l.bdSupplyMat, l.bdMaterial, l.bdRevision, l.bdDesign, l.bdForex, l.bdOther]
    .map(toNum)
    .filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) * 10000) / 10000;
}

/**
 * 単価申請フォーム（新規・下書き編集共通）。
 * - 見積書（PDF/画像）のAI読み取りで明細を自動入力
 * - 品番・取引先マスタのインクリメンタル検索
 * - 現行単価の自動取得（単価履歴から）
 */
export default function RequestForm({
  requestId,
  initialTitle,
  initialLines,
  today,
}: {
  requestId?: string;
  initialTitle?: string | null;
  initialLines?: PriceRequestLine[];
  today: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle ?? "");
  const [lines, setLines] = useState<FormLine[]>(
    initialLines && initialLines.length > 0
      ? initialLines.map(fromExisting)
      : [emptyLine(today)]
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<"none" | "draft" | "submit">("none");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function update(i: number, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine(today), supplierCd: prev[prev.length - 1]?.supplierCd ?? "", supplierName: prev[prev.length - 1]?.supplierName ?? "", startDate: prev[prev.length - 1]?.startDate ?? today }]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  /** 現行単価を単価履歴から自動取得 */
  async function fetchCurrent(i: number) {
    const l = lines[i];
    if (!l.itemCd || !l.supplierCd) {
      setError("現行単価の取得には品目CDと発注先CDが必要です。");
      return;
    }
    setError("");
    const qs = new URLSearchParams({
      type: "current",
      item: l.itemCd,
      supplier: l.supplierCd,
    });
    if (l.itemBranch) qs.set("branch", l.itemBranch);
    if (l.locCd) qs.set("loc", l.locCd);
    if (l.startDate) qs.set("date", l.startDate);
    const res = await fetch(`/api/lookup?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (data.current) {
      update(i, {
        currentPrice: String(data.current.price),
        unitCd: lines[i].unitCd || (data.current.unitCd ?? ""),
        lotQty: lines[i].lotQty || (data.current.lotQty != null ? String(data.current.lotQty) : ""),
        itemName: lines[i].itemName || (data.current.itemName ?? ""),
        supplierName: lines[i].supplierName || (data.current.supplierName ?? ""),
      });
    } else {
      setError(`明細${i + 1}: 単価履歴に現行単価が見つかりませんでした（新規品目の場合はそのまま申請できます）。`);
    }
  }

  /** 品番マスタから補完（品目CD確定時） */
  async function lookupItem(i: number) {
    const l = lines[i];
    if (!l.itemCd) return;
    const res = await fetch(`/api/lookup?type=items&q=${encodeURIComponent(l.itemCd)}`);
    const data = await res.json().catch(() => ({}));
    const hit = (data.items ?? []).find(
      (it: { code: string; branch: string | null }) =>
        it.code === l.itemCd && (it.branch ?? "") === (l.itemBranch || "")
    ) ?? (data.items ?? [])[0];
    if (hit && !l.itemName) {
      update(i, { itemName: hit.name ?? "", unitCd: l.unitCd || (hit.unitCd ?? "") });
    }
  }

  /** 取引先マスタから補完 */
  async function lookupSupplier(i: number) {
    const l = lines[i];
    if (!l.supplierCd) return;
    const res = await fetch(`/api/lookup?type=suppliers&q=${encodeURIComponent(l.supplierCd)}`);
    const data = await res.json().catch(() => ({}));
    const hit = (data.suppliers ?? []).find((s: { code: string }) => s.code === l.supplierCd) ?? (data.suppliers ?? [])[0];
    if (hit && !l.supplierName) {
      update(i, { supplierName: hit.name ?? "" });
    }
  }

  /** 見積書AI取り込み */
  async function importQuote(file: File) {
    setQuoteLoading(true);
    setError("");
    try {
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const fileBase64 = btoa(binary);
      const res = await fetch("/api/import-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, contentType: file.type || "application/pdf", fileName: file.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "見積書の読み取りに失敗しました。");
        return;
      }
      const q = data.quote as {
        supplierCd: string | null;
        supplierName: string | null;
        effectiveDate: string | null;
        currency: string | null;
        items: Array<{
          itemCd: string | null;
          itemName: string | null;
          unitPrice: number;
          unit: string | null;
          lotQty: number | null;
          notes: string | null;
        }>;
      };
      const start = q.effectiveDate ?? today;
      const newLines: FormLine[] = q.items.map((it) => ({
        ...emptyLine(start),
        itemCd: it.itemCd ?? "",
        itemName: it.itemName ?? "",
        supplierCd: q.supplierCd ?? "",
        supplierName: q.supplierName ?? "",
        unitCd: it.unit ?? "",
        lotQty: it.lotQty != null ? String(it.lotQty) : "",
        currency: q.currency ?? "JPY",
        newPrice: String(it.unitPrice),
        reasonNote: it.notes ?? "",
      }));
      // 既存が空1行だけなら置き換え、そうでなければ追記
      setLines((prev) => {
        const isEmpty =
          prev.length === 1 && !prev[0].itemCd && !prev[0].newPrice && !prev[0].supplierCd;
        return isEmpty ? newLines : [...prev, ...newLines];
      });
    } finally {
      setQuoteLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save(submit: boolean) {
    setError("");
    // 入力チェック（サーバー側でも検証するが、先にわかりやすく）
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.itemCd.trim()) return setError(`明細${i + 1}: 品目CDを入力してください。`);
      if (!l.supplierCd.trim()) return setError(`明細${i + 1}: 発注先CDを入力してください。`);
      if (!l.startDate) return setError(`明細${i + 1}: 適用開始日を入力してください。`);
      if (toNum(l.newPrice) == null) return setError(`明細${i + 1}: 購入単価を数値で入力してください。`);
      const d = diffOf(l);
      const s = bdSum(l);
      if (submit && d != null && s != null && Math.abs(d - s) > 0.0001) {
        return setError(
          `明細${i + 1}: 内訳の合計（${s}）が単価差（${d}）と一致しません。内訳を確認してください。`
        );
      }
    }
    setSaving(submit ? "submit" : "draft");
    try {
      if (requestId) {
        await updateRequestAction({
          requestId,
          title: title.trim() || null,
          lines: toPayload(lines),
          submit,
        });
        router.push(`/requests/${requestId}`);
      } else {
        const { id } = await createRequestAction({
          title: title.trim() || null,
          lines: toPayload(lines),
          submit,
        });
        router.push(`/requests/${id}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
      setSaving("none");
    }
  }

  const inputCls =
    "w-full rounded border border-[#d5d5d5] bg-white px-2 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none focus:ring-1 focus:ring-[#e11d48]";
  const labelCls = "block text-[11px] font-medium text-[#707070] mb-0.5";

  return (
    <div className="space-y-4">
      {/* ツールバー: タイトル + 見積書AI取り込み */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4">
        <div className="min-w-64 flex-1">
          <label className={labelCls}>申請タイトル（任意・例: 2026/8月改定 ○○社）</label>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 銀・銅価格高騰に伴う価格改定"
          />
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importQuote(f);
            }}
          />
          <button
            type="button"
            disabled={quoteLoading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#e11d48] px-4 py-2 text-sm font-semibold text-[#e11d48] hover:bg-[#fff1f2] disabled:opacity-50"
          >
            {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {quoteLoading ? "見積書を読み取り中…" : "見積書から自動入力（PDF/画像）"}
          </button>
        </div>
      </div>

      {/* 明細 */}
      {lines.map((l, i) => {
        const d = diffOf(l);
        const s = bdSum(l);
        const mismatch = d != null && s != null && Math.abs(d - s) > 0.0001;
        return (
          <div key={i} className="rounded-xl border border-[#e5e5e5] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#333333]">明細 {i + 1}</h3>
              <button
                type="button"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 1}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
                削除
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <div>
                <label className={labelCls}>品目CD *</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={l.itemCd}
                  onChange={(e) => update(i, { itemCd: e.target.value })}
                  onBlur={() => void lookupItem(i)}
                  placeholder="097384000"
                />
              </div>
              <div>
                <label className={labelCls}>枝番</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={l.itemBranch}
                  onChange={(e) => update(i, { itemBranch: e.target.value })}
                  placeholder="（なし）"
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>品名</label>
                <input
                  className={inputCls}
                  value={l.itemName}
                  onChange={(e) => update(i, { itemName: e.target.value })}
                  placeholder="タクトスイッチ"
                />
              </div>
              <div>
                <label className={labelCls}>発注先CD *</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={l.supplierCd}
                  onChange={(e) => update(i, { supplierCd: e.target.value })}
                  onBlur={() => void lookupSupplier(i)}
                  placeholder="00906"
                />
              </div>
              <div>
                <label className={labelCls}>発注先名</label>
                <input
                  className={inputCls}
                  value={l.supplierName}
                  onChange={(e) => update(i, { supplierName: e.target.value })}
                  placeholder="北陸電気工業㈱"
                />
              </div>

              <div>
                <label className={labelCls}>納入場所CD</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={l.locCd}
                  onChange={(e) => update(i, { locCd: e.target.value })}
                  placeholder="M15"
                />
              </div>
              <div>
                <label className={labelCls}>納入場所名</label>
                <input
                  className={inputCls}
                  value={l.locName}
                  onChange={(e) => update(i, { locName: e.target.value })}
                  placeholder="直方内胴材料棟"
                />
              </div>
              <div>
                <label className={labelCls}>納品先CD</label>
                <input
                  className={`${inputCls} font-mono`}
                  value={l.dlvCd}
                  onChange={(e) => update(i, { dlvCd: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>単位CD</label>
                <input
                  className={inputCls}
                  value={l.unitCd}
                  onChange={(e) => update(i, { unitCd: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>ロット数</label>
                <input
                  className={`${inputCls} text-right`}
                  inputMode="decimal"
                  value={l.lotQty}
                  onChange={(e) => update(i, { lotQty: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>通貨</label>
                <input
                  className={inputCls}
                  value={l.currency}
                  onChange={(e) => update(i, { currency: e.target.value })}
                />
              </div>

              <div>
                <label className={labelCls}>適用開始日 *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={l.startDate}
                  onChange={(e) => update(i, { startDate: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>適用終了日</label>
                <input
                  type="date"
                  className={inputCls}
                  value={l.endDate}
                  onChange={(e) => update(i, { endDate: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>現行単価</label>
                <div className="flex gap-1">
                  <input
                    className={`${inputCls} text-right font-mono`}
                    inputMode="decimal"
                    value={l.currentPrice}
                    onChange={(e) => update(i, { currentPrice: e.target.value })}
                  />
                  <button
                    type="button"
                    title="単価履歴から現行単価を取得"
                    onClick={() => void fetchCurrent(i)}
                    className="shrink-0 rounded border border-[#d5d5d5] px-2 text-[#e11d48] hover:bg-[#fff1f2]"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>購入単価（新単価）*</label>
                <input
                  className={`${inputCls} text-right font-mono font-bold`}
                  inputMode="decimal"
                  value={l.newPrice}
                  onChange={(e) => update(i, { newPrice: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>有償支給価格</label>
                <input
                  className={`${inputCls} text-right font-mono`}
                  inputMode="decimal"
                  value={l.paidSupplyPrice}
                  onChange={(e) => update(i, { paidSupplyPrice: e.target.value })}
                />
              </div>
              <div>
                <label className={labelCls}>単価差（自動計算）</label>
                <div
                  className={`rounded border px-2 py-1.5 text-right font-mono text-sm ${
                    d == null
                      ? "border-[#eeeeee] bg-[#fafafa] text-[#a0a0a0]"
                      : d > 0
                        ? "border-red-200 bg-red-50 text-red-700"
                        : d < 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-[#eeeeee] bg-[#fafafa]"
                  }`}
                >
                  {d == null ? "—" : d > 0 ? `+${d}` : String(d)}
                </div>
              </div>
            </div>

            {/* 改訂理由の内訳（承認用紙の内訳欄） */}
            <div className="mt-3 rounded-lg bg-[#f8fafc] p-3">
              <div className="mb-2 text-[11px] font-bold text-[#707070]">
                単価差の内訳（改訂理由別・承認用紙に記載されます）
                {mismatch && (
                  <span className="ml-2 font-medium text-red-600">
                    ⚠ 内訳合計 {s} が単価差 {d} と一致していません
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {(
                  [
                    ["bdSupplyMat", "支給材建値"],
                    ["bdMaterial", "材料建値"],
                    ["bdRevision", "単価改定"],
                    ["bdDesign", "設計変更"],
                    ["bdForex", "為替変動"],
                    ["bdOther", "その他"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input
                      className={`${inputCls} text-right font-mono`}
                      inputMode="decimal"
                      value={l[key]}
                      onChange={(e) => update(i, { [key]: e.target.value } as Partial<FormLine>)}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <label className={labelCls}>備考（改訂理由。例: 銀・銅価格の高騰に伴う価格改定）</label>
                <input
                  className={inputCls}
                  value={l.reasonNote}
                  onChange={(e) => update(i, { reasonNote: e.target.value })}
                  placeholder="改訂理由を記入"
                />
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addLine}
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[#c5c5c5] px-4 py-2 text-sm text-[#555555] hover:border-[#e11d48] hover:text-[#e11d48]"
      >
        <Plus className="h-4 w-4" />
        明細を追加
      </button>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving !== "none"}
          onClick={() => void save(false)}
          className="rounded-lg border border-[#d5d5d5] bg-white px-5 py-2.5 text-sm font-semibold text-[#555555] hover:bg-[#f7f7f5] disabled:opacity-50"
        >
          {saving === "draft" ? "保存中…" : "下書き保存"}
        </button>
        <button
          type="button"
          disabled={saving !== "none"}
          onClick={() => void save(true)}
          className="rounded-lg bg-[#e11d48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
        >
          {saving === "submit" ? "提出中…" : "申請を提出（承認へ回す）"}
        </button>
      </div>
    </div>
  );
}
