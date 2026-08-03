"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Keyboard,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { createRequestAction, updateRequestAction } from "@/lib/actions";
import QuoteImport, { type QuoteAppliedLine } from "@/components/QuoteImport";
import BulkLinesImport from "@/components/BulkLinesImport";
import SupplierPicker, { type PickedSupplier } from "@/components/SupplierPicker";
import ItemPicker, { type PickedItem } from "@/components/ItemPicker";
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
  monthlyQty: string;
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
    monthlyQty: "",
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
    monthlyQty: n(l.monthlyQty),
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
    monthlyQty: toNum(l.monthlyQty),
    bdSupplyMat: toNum(l.bdSupplyMat),
    bdMaterial: toNum(l.bdMaterial),
    bdRevision: toNum(l.bdRevision),
    bdDesign: toNum(l.bdDesign),
    bdForex: toNum(l.bdForex),
    bdOther: toNum(l.bdOther),
    reasonNote: l.reasonNote || null,
  }));
}

/** YYYY-MM-DD の前日（旧単価の取消日＝新単価適用日の前日） */
function dayBeforeStr(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  d.setUTCDate(d.getUTCDate() - 1);
  const s = d.toISOString().slice(0, 10);
  return s.replace(/-/g, "/");
}

/**
 * 前回の適用終了日の「翌日」。次の改訂の適用日の既定値に使う。
 * 2099-12-31 のような無期限（適用終了日なし）の場合は既定値を動かさない。
 */
function nextDayOf(ymd: string | null | undefined, notBefore?: string): string | null {
  if (!ymd) return null;
  const t = ymd.slice(0, 10);
  // 無期限を表す番人日付は「前回の終了日」とみなさない
  if (t >= "2099-01-01") return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  const next = d.toISOString().slice(0, 10);
  // ずっと前に終了したままの単価に引きずられて、過去の日付に戻さない
  if (notBefore && next < notBefore) return null;
  return next;
}

/** 差額（新単価 − 旧単価）。片方未入力なら null */
function diffOf(l: FormLine): number | null {
  const cur = toNum(l.currentPrice);
  const nw = toNum(l.newPrice);
  if (cur == null || nw == null) return null;
  return Math.round((nw - cur) * 10000) / 10000;
}

/** 入力方法のタブ */
type Tab = "manual" | "quote" | "bulk";

/** 明細が「空の1行だけ」か（取り込み結果で置き換えてよいか）の判定 */
function isBlank(lines: FormLine[]): boolean {
  return lines.length === 1 && !lines[0].itemCd && !lines[0].newPrice;
}

/** 月当たり金額（新単価 × 月当たり数量）。数量未入力なら null */
function monthlyAmountOf(l: FormLine): number | null {
  const q = toNum(l.monthlyQty);
  const p = toNum(l.newPrice);
  if (q == null || p == null) return null;
  return Math.round(q * p * 100) / 100;
}

/** 単価改訂の月当たり影響額（単価差 × 月当たり数量）。どちらか未入力なら null */
function impactOf(l: FormLine): number | null {
  const q = toNum(l.monthlyQty);
  const d = diffOf(l);
  if (q == null || d == null) return null;
  return Math.round(q * d * 100) / 100;
}

/** 単価差の内訳（改訂理由別）。表の列としてこの順で並べる */
const BREAKDOWN = [
  ["bdSupplyMat", "支給材建値"],
  ["bdMaterial", "材料建値"],
  ["bdRevision", "単価改定"],
  ["bdDesign", "設計変更"],
  ["bdForex", "為替変動"],
  ["bdOther", "その他"],
] as const satisfies ReadonlyArray<readonly [keyof FormLine, string]>;

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
 * - 見積書（Excel/PDF/画像）のAI読み取り→プレビュー確認→明細へ反映
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
  /** 保存時にまとめてアップロードする添付資料 */
  const [attachments, setAttachments] = useState<File[]>([]);
  // 入力方法のタブ（手入力／見積書から取り込み／Excel・CSVで一括入力）
  const [tab, setTab] = useState<Tab>("manual");
  // 取引先（申請の対象）。編集時は既存明細から復元する
  const [supplier, setSupplier] = useState<PickedSupplier | null>(() => {
    const first = initialLines?.[0];
    return first?.supplierCd
      ? { code: first.supplierCd, name: first.supplierName ?? "" }
      : null;
  });

  // 単価改訂の影響額（月当たり）。数量が入っている明細だけを合計する
  const sumOf = (f: (l: FormLine) => number | null): number | null => {
    const vals = lines.map(f).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100;
  };
  const totalQty = sumOf((l) => toNum(l.monthlyQty));
  const totalAmount = sumOf(monthlyAmountOf);
  const totalImpact = sumOf(impactOf);

  /** 品目候補から選択したときに、品名・単位・ロット・納入場所・現行単価をまとめて反映 */
  function pickItem(i: number, it: PickedItem) {
    // 旧単価の取消日＝前回の適用終了日。その翌日を新単価の適用日の既定にする
    const next = nextDayOf(it.endDate, today);
    update(i, {
      itemCd: it.code,
      itemBranch: it.branch ?? "",
      itemName: it.name,
      unitCd: it.unitCd ?? "",
      lotQty: it.lotQty != null ? String(it.lotQty) : "",
      locCd: it.locCd ?? "",
      dlvCd: it.dlvCd ?? "",
      currentPrice: it.currentPrice != null ? String(it.currentPrice) : "",
      ...(next ? { startDate: next } : {}),
    });
  }

  function update(i: number, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine(today), supplierCd: prev[prev.length - 1]?.supplierCd ?? "", supplierName: prev[prev.length - 1]?.supplierName ?? "", startDate: prev[prev.length - 1]?.startDate ?? today }]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));
  }

  /** 現行単価（旧単価）を単価履歴から自動取得。取引先は申請の取引先を使う。 */
  async function fetchCurrent(i: number) {
    const l = lines[i];
    if (!supplier) {
      setError("旧単価の自動取得には取引先の選択が必要です。上の「取引先」から選んでください。");
      return;
    }
    if (!l.itemCd) {
      setError(`明細${i + 1}: 品目CDを入力してください。`);
      return;
    }
    setError("");
    const qs = new URLSearchParams({
      type: "current",
      item: l.itemCd,
      supplier: supplier?.code ?? "",
    });
    if (l.itemBranch) qs.set("branch", l.itemBranch);
    if (l.locCd) qs.set("loc", l.locCd);
    if (l.startDate) qs.set("date", l.startDate);
    const res = await fetch(`/api/lookup?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (data.current) {
      // 旧単価に適用終了日が入っていれば、その翌日を適用日の既定にする
      const next = nextDayOf(data.current.endDate, today);
      update(i, {
        currentPrice: String(data.current.price),
        unitCd: lines[i].unitCd || (data.current.unitCd ?? ""),
        lotQty: lines[i].lotQty || (data.current.lotQty != null ? String(data.current.lotQty) : ""),
        itemName: lines[i].itemName || (data.current.itemName ?? ""),
        ...(next ? { startDate: next } : {}),
      });
    } else {
      setError(`明細${i + 1}: 単価履歴に現行単価が見つかりませんでした（新規品目の場合はそのまま申請できます）。`);
    }
  }

  /** 見積書AI取り込みのプレビュー結果を明細へ反映（QuoteImport から呼ばれる） */
  function applyQuoteLines(applied: QuoteAppliedLine[]) {
    if (applied.length === 0) return;
    const newLines: FormLine[] = applied.map((a) => ({
      ...emptyLine(a.startDate || today),
      itemCd: a.itemCd,
      itemName: a.itemName,
      supplierCd: a.supplierCd,
      supplierName: a.supplierName,
      unitCd: a.unitCd,
      lotQty: a.lotQty,
      currency: a.currency || "JPY",
      newPrice: a.newPrice,
      reasonNote: a.reasonNote,
    }));
    // 既存が空1行だけなら置き換え、そうでなければ追記
    setLines((prev) => (isBlank(prev) ? newLines : [...prev, ...newLines]));
    setTab("manual");
  }

  async function save(submit: boolean) {
    setError("");
    if (!supplier) return setError("取引先を選択してください。");
    // 明細の取引先は申請の取引先で統一する（単価申請は取引先ごとに作成する）
    const payloadLines: FormLine[] = lines.map((l) => ({
      ...l,
      supplierCd: supplier.code,
      supplierName: supplier.name,
    }));
    // 入力チェック（サーバー側でも検証するが、先にわかりやすく）
    for (let i = 0; i < payloadLines.length; i++) {
      const l = payloadLines[i];
      if (!l.itemCd.trim()) return setError(`明細${i + 1}: 品目CDを入力してください。`);
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
      let id = requestId;
      if (requestId) {
        await updateRequestAction({
          requestId,
          title: title.trim() || null,
          lines: toPayload(payloadLines),
          submit,
        });
      } else {
        id = (
          await createRequestAction({
            title: title.trim() || null,
            lines: toPayload(payloadLines),
            submit,
          })
        ).id;
      }
      // 添付資料は申請の保存後にまとめて送る（失敗しても申請自体は保存済み）
      if (id && attachments.length > 0) {
        const fd = new FormData();
        fd.set("requestId", id);
        for (const f of attachments) fd.append("file", f);
        const res = await fetch("/api/request-files", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(
            `申請は保存しましたが、添付に失敗しました: ${data.error ?? "不明なエラー"}（申請詳細から添付し直せます）`
          );
        } else {
          setAttachments([]);
        }
      }
      router.push(`/requests/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。");
      setSaving("none");
    }
  }

  const inputCls =
    "w-full rounded border border-[#d5d5d5] bg-white px-2 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none focus:ring-1 focus:ring-[#e11d48]";
  const labelCls = "block text-[11px] font-medium text-[#707070] mb-0.5";


  /** 一括入力（Excel/CSV）で解析した明細を追加 */
  function applyBulkLines(bulk: LineInput[]) {
    if (bulk.length === 0) return;
    const newLines: FormLine[] = bulk.map((b) => ({
      ...emptyLine(b.startDate || today),
      itemCd: b.itemCd,
      itemBranch: b.itemBranch ?? "",
      itemName: b.itemName ?? "",
      supplierCd: supplier?.code ?? b.supplierCd ?? "",
      supplierName: supplier?.name ?? b.supplierName ?? "",
      locCd: b.locCd ?? "",
      locName: b.locName ?? "",
      dlvCd: b.dlvCd ?? "",
      dlvName: b.dlvName ?? "",
      unitCd: b.unitCd ?? "",
      lotQty: b.lotQty != null ? String(b.lotQty) : "",
      currency: b.currency ?? "JPY",
      startDate: b.startDate || today,
      endDate: b.endDate ?? "2099-12-31",
      currentPrice: b.currentPrice != null ? String(b.currentPrice) : "",
      newPrice: Number.isFinite(b.newPrice) ? String(b.newPrice) : "",
      paidSupplyPrice: b.paidSupplyPrice != null ? String(b.paidSupplyPrice) : "",
      bdSupplyMat: b.bdSupplyMat != null ? String(b.bdSupplyMat) : "",
      bdMaterial: b.bdMaterial != null ? String(b.bdMaterial) : "",
      bdRevision: b.bdRevision != null ? String(b.bdRevision) : "",
      bdDesign: b.bdDesign != null ? String(b.bdDesign) : "",
      bdForex: b.bdForex != null ? String(b.bdForex) : "",
      bdOther: b.bdOther != null ? String(b.bdOther) : "",
      reasonNote: b.reasonNote ?? "",
    }));
    setLines((prev) => (isBlank(prev) ? newLines : [...prev, ...newLines]));
    setTab("manual");
  }

  const th = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-medium text-[#707070]";
  const thGroup =
    "whitespace-nowrap px-2 py-1 text-center text-[11px] font-bold tracking-wide text-[#707070]";
  const td = "px-2 py-1.5 align-top";
  const cell =
    "w-full rounded border border-[#d5d5d5] bg-white px-2 py-1 text-sm focus:border-[#e11d48] focus:outline-none focus:ring-1 focus:ring-[#e11d48]";

  const TABS: { key: Tab; label: string; icon: typeof Keyboard }[] = [
    { key: "manual", label: "手入力", icon: Keyboard },
    { key: "quote", label: "見積書から取り込み", icon: Sparkles },
    { key: "bulk", label: "Excel/CSVで一括入力", icon: FileSpreadsheet },
  ];

  return (
    <div className="space-y-4">
      {/* ① 取引先の選択（単価申請は取引先ごと） */}
      <SupplierPicker
        value={supplier}
        onChange={(s) => {
          setSupplier(s);
          if (s) {
            setLines((prev) =>
              prev.map((l) => ({ ...l, supplierCd: s.code, supplierName: s.name }))
            );
          }
        }}
      />

      {/* 申請タイトル */}
      <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
        <label className={labelCls}>申請タイトル（改訂理由）</label>
        <input
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 銀・銅価格高騰に伴う価格改定（2026/8月改定 ○○社）"
        />
        <p className="mt-1 text-xs text-[#a0a0a0]">
          この申請全体の改訂理由を入れてください。明細ごとに補足したいことがある場合だけ、明細の「備考」に記入します。
        </p>
      </div>

      {/* ①取引先の選択と②明細の入力は同時に進められる（取引先は提出前に決まっていればよい） */}
      <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e11d48] text-xs font-bold text-white">
              2
            </span>
            <h2 className="text-sm font-bold text-[#333333]">品目と単価を入力してください</h2>
            {!supplier && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                取引先を選ぶと、品目CDの候補・旧単価の自動取得が使えます（保存前に選択してください）
              </span>
            )}
          </div>

          {/* 入力方法のタブ */}
          <div className="inline-flex flex-wrap rounded-lg border border-[#e5e5e5] bg-white p-1 text-sm">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium ${
                    tab === t.key ? "bg-[#e11d48] text-white" : "text-[#555555] hover:bg-[#f7f7f5]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === "quote" && <QuoteImport today={today} onApply={applyQuoteLines} />}
          {tab === "bulk" && <BulkLinesImport onApply={applyBulkLines} />}

          {/* 明細（表形式） */}
          <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
            <table className="w-full min-w-[2240px] border-collapse text-sm">
              <thead>
                {/* 品目の属性（枝番・単位・ロット数）→ 新単価 → 旧単価 → 単価差 → 内訳 → 月当たり */}
                <tr className="border-b border-[#f0f0f0] bg-[#fafafa] text-center">
                  <th className={`${th} w-10`} rowSpan={2}>#</th>
                  <th className={`${th} w-52`} rowSpan={2}>品目CD *</th>
                  <th className={`${th} w-16`} rowSpan={2}>枝番</th>
                  <th className={`${th} w-44`} rowSpan={2}>品名</th>
                  <th className={`${th} w-16`} rowSpan={2}>単位</th>
                  <th className={`${th} w-20 text-right`} rowSpan={2}>ロット数</th>
                  <th className={`${th} w-24`} rowSpan={2}>納入場所</th>
                  <th className={`${thGroup} border-l border-[#eeeeee] bg-rose-50`} colSpan={4}>
                    新 単 価
                  </th>
                  <th className={`${th} w-28 border-l border-[#eeeeee] bg-slate-50 text-right`} rowSpan={2}>
                    旧単価
                  </th>
                  <th className={`${th} w-24 border-l border-[#eeeeee] text-right`} rowSpan={2}>
                    単価差
                  </th>
                  <th className={`${thGroup} border-l border-[#eeeeee] bg-amber-50`} colSpan={6}>
                    単 価 差 の 内 訳
                  </th>
                  <th className={`${thGroup} border-l border-[#eeeeee] bg-amber-50/50`} colSpan={3}>
                    月 当 た り
                  </th>
                  <th className={`${th} w-40 border-l border-[#eeeeee]`} rowSpan={2}>備考</th>
                  <th className={`${th} w-16 text-center`} rowSpan={2}>操作</th>
                </tr>
                <tr className="border-b border-[#eeeeee] bg-[#fafafa]">
                  <th className={`${th} w-28 border-l border-[#eeeeee] bg-rose-50`}>適用日 *</th>
                  <th className={`${th} w-24 bg-rose-50 text-right`}>新単価 *</th>
                  <th className={`${th} w-24 bg-rose-50 text-right`}>支給単価</th>
                  <th className={`${th} w-32 bg-rose-50`}>適用終了日</th>
                  {BREAKDOWN.map(([key, label], bi) => (
                    <th
                      key={key}
                      className={`${th} w-16 text-right ${bi === 0 ? "border-l border-[#eeeeee]" : ""}`}
                    >
                      {label}
                    </th>
                  ))}
                  <th className={`${th} w-20 border-l border-[#eeeeee] text-right`}>数量</th>
                  <th className={`${th} w-24 text-right`}>月額</th>
                  <th className={`${th} w-24 text-right`}>改訂影響額</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const d = diffOf(l);
                  const s = bdSum(l);
                  const mismatch = d != null && s != null && Math.abs(d - s) > 0.0001;
                  const amt = monthlyAmountOf(l);
                  const impact = impactOf(l);
                  const isNew = l.currentPrice.trim() === "";
                  return (
                    <Fragment key={i}>
                      <tr className="border-b border-[#f5f5f5] align-top">
                        <td className={`${td} pt-3 text-xs text-[#707070]`}>{i + 1}</td>
                        <td className={td}>
                          <ItemPicker
                            supplierCd={supplier?.code ?? ""}
                            value={l.itemCd}
                            onTextChange={(code) => update(i, { itemCd: code })}
                            onPick={(it) => pickItem(i, it)}
                          />
                        </td>
                        <td className={td}>
                          <input
                            className={`${cell} px-1 font-mono`}
                            value={l.itemBranch}
                            onChange={(e) => update(i, { itemBranch: e.target.value })}
                          />
                        </td>
                        <td className={td}>
                          <input
                            className={cell}
                            value={l.itemName}
                            onChange={(e) => update(i, { itemName: e.target.value })}
                            placeholder="品名"
                          />
                        </td>
                        <td className={td}>
                          <input
                            className={`${cell} px-1`}
                            value={l.unitCd}
                            onChange={(e) => update(i, { unitCd: e.target.value })}
                          />
                        </td>
                        <td className={td}>
                          <input
                            className={`${cell} px-1 text-right font-mono`}
                            inputMode="decimal"
                            value={l.lotQty}
                            onChange={(e) => update(i, { lotQty: e.target.value })}
                          />
                        </td>
                        <td className={td}>
                          <input
                            className={`${cell} font-mono`}
                            value={l.locCd}
                            onChange={(e) => update(i, { locCd: e.target.value })}
                            placeholder="M15"
                          />
                        </td>
                        {/* 新単価 */}
                        <td className={`${td} border-l border-[#f0f0f0] bg-rose-50/40`}>
                          <input
                            type="date"
                            className={cell}
                            value={l.startDate}
                            onChange={(e) => update(i, { startDate: e.target.value })}
                          />
                        </td>
                        <td className={`${td} bg-rose-50/40`}>
                          <input
                            className={`${cell} text-right font-mono font-bold`}
                            inputMode="decimal"
                            value={l.newPrice}
                            onChange={(e) => update(i, { newPrice: e.target.value })}
                          />
                        </td>
                        <td className={`${td} bg-rose-50/40`}>
                          <input
                            className={`${cell} text-right font-mono`}
                            inputMode="decimal"
                            value={l.paidSupplyPrice}
                            onChange={(e) => update(i, { paidSupplyPrice: e.target.value })}
                          />
                        </td>
                        <td className={`${td} bg-rose-50/40`}>
                          <input
                            type="date"
                            className={`${cell} px-1`}
                            value={l.endDate}
                            onChange={(e) => update(i, { endDate: e.target.value })}
                          />
                        </td>
                        {/* 旧単価 */}
                        <td className={`${td} border-l border-[#f0f0f0] bg-slate-50/60`}>
                          <div className="flex gap-1">
                            <input
                              className={`${cell} text-right font-mono`}
                              inputMode="decimal"
                              value={l.currentPrice}
                              onChange={(e) => update(i, { currentPrice: e.target.value })}
                              placeholder="新規は空欄"
                            />
                            <button
                              type="button"
                              title="単価履歴から旧単価を取得"
                              onClick={() => void fetchCurrent(i)}
                              className="shrink-0 rounded border border-[#d5d5d5] bg-white px-1.5 text-[#e11d48] hover:bg-[#fff1f2]"
                            >
                              <Search className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-0.5 text-[10px] text-[#a0a0a0]">
                            {isNew ? "新規登録品" : `取消日 ${dayBeforeStr(l.startDate)}`}
                          </div>
                        </td>
                        {/* 単価差 */}
                        <td className={`${td} border-l border-[#f0f0f0]`}>
                          <div
                            className={`rounded px-2 py-1 text-right font-mono text-sm font-bold ${
                              d == null
                                ? "bg-[#fafafa] text-[#a0a0a0]"
                                : d > 0
                                  ? "bg-red-50 text-red-700"
                                  : d < 0
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-[#fafafa]"
                            }`}
                          >
                            {d == null ? "—" : d > 0 ? `+${d}` : String(d)}
                          </div>
                          {mismatch && (
                            <div className="mt-0.5 text-[10px] font-medium text-red-600">
                              内訳計 {s}
                            </div>
                          )}
                        </td>
                        {/* 単価差の内訳（改訂理由別・申請書に記載される） */}
                        {BREAKDOWN.map(([key], bi) => (
                          <td
                            key={key}
                            className={`${td} ${bi === 0 ? "border-l border-[#f0f0f0]" : ""} bg-amber-50/30`}
                          >
                            <input
                              className={`${cell} px-1 text-right font-mono`}
                              inputMode="decimal"
                              value={l[key]}
                              onChange={(e) =>
                                update(i, { [key]: e.target.value } as Partial<FormLine>)
                              }
                            />
                          </td>
                        ))}
                        {/* 月当たり数量と改訂影響額 */}
                        <td className={`${td} border-l border-[#f0f0f0]`}>
                          <input
                            className={`${cell} px-1 text-right`}
                            inputMode="decimal"
                            value={l.monthlyQty}
                            onChange={(e) => update(i, { monthlyQty: e.target.value })}
                            placeholder="数量"
                          />
                        </td>
                        <td className={`${td} text-right font-mono text-xs text-[#707070]`}>
                          {amt == null ? "—" : amt.toLocaleString()}
                        </td>
                        <td className={`${td} text-right`}>
                          <span
                            className={`font-mono text-sm font-bold ${
                              impact == null
                                ? "text-[#a0a0a0]"
                                : impact > 0
                                  ? "text-red-700"
                                  : impact < 0
                                    ? "text-emerald-700"
                                    : ""
                            }`}
                          >
                            {impact == null ? "—" : `${impact > 0 ? "+" : ""}${impact.toLocaleString()}`}
                          </span>
                        </td>
                        <td className={`${td} border-l border-[#f0f0f0]`}>
                          <input
                            className={cell}
                            value={l.reasonNote}
                            onChange={(e) => update(i, { reasonNote: e.target.value })}
                            placeholder="明細ごとの補足"
                          />
                        </td>
                        <td className={`${td} text-center`}>
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            disabled={lines.length <= 1}
                            className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-30"
                            title="この明細を削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>

                    </Fragment>
                  );
                })}
              </tbody>
              {/* 合計（単価改訂の影響額） */}
              <tfoot>
                <tr className="border-t-2 border-[#e5e5e5] bg-[#fafafa] text-sm font-bold">
                  {/* #〜内訳（19列）までをまとめて見出しにする */}
                  <td className="px-2 py-2 text-right text-xs text-[#707070]" colSpan={19}>
                    合計（月当たり）
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-xs text-[#707070]">
                    {totalQty == null ? "—" : totalQty.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right font-mono">
                    {totalAmount == null ? "—" : totalAmount.toLocaleString()}
                  </td>
                  <td
                    className={`px-2 py-2 text-right font-mono ${
                      totalImpact == null
                        ? "text-[#a0a0a0]"
                        : totalImpact > 0
                          ? "text-red-700"
                          : totalImpact < 0
                            ? "text-emerald-700"
                            : ""
                    }`}
                  >
                    {totalImpact == null
                      ? "—"
                      : `${totalImpact > 0 ? "+" : ""}${totalImpact.toLocaleString()}`}
                  </td>
                  {/* 備考＋操作 */}
                  <td className="px-2 py-2 text-xs font-normal text-[#a0a0a0]" colSpan={2}>
                    年換算 {totalImpact == null ? "—" : `${(Math.round(totalImpact * 12 * 100) / 100).toLocaleString()}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[#c5c5c5] px-4 py-2 text-sm text-[#555555] hover:border-[#e11d48] hover:text-[#e11d48]"
          >
            <Plus className="h-4 w-4" />
            明細を追加
          </button>
      </>

      {/* 添付資料（見積書・仕様書など）。保存時にまとめてアップロードする */}
      <section className="rounded-xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[#333333]">
          <Paperclip className="h-4 w-4 text-[#707070]" />
          添付資料
          <span className="font-normal text-[#a0a0a0]">（見積書・仕様書など・任意）</span>
        </h2>
        {attachments.length > 0 && (
          <ul className="mb-2 divide-y divide-[#f5f5f5]">
            {attachments.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-[#a0a0a0]">
                  {f.size >= 1024 * 1024
                    ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
                    : `${Math.round(f.size / 1024)} KB`}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-auto shrink-0 rounded p-1 text-red-500 hover:bg-red-50"
                  title="外す"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#c5c5c5] px-4 py-2 text-sm text-[#555555] hover:border-[#e11d48] hover:text-[#e11d48]">
          <Paperclip className="h-4 w-4" />
          ファイルを選ぶ
          <input
            type="file"
            multiple
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              setAttachments((prev) => [...prev, ...picked]);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>
        <p className="mt-1.5 text-[10px] text-[#a0a0a0]">
          保存・提出と同時にアップロードします（1ファイル4MBまで）。承認後は単価履歴からも閲覧できます。
        </p>
      </section>

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
          {saving === "submit" ? "提出中…" : `申請を提出（${lines.length}件を承認へ）`}
        </button>
      </div>
    </div>
  );
}
