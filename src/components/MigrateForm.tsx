"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, DatabaseZap, Loader2, Wand2 } from "lucide-react";
import { backfillNamesAction } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";

/**
 * 初期データ移行フォーム（運用開始時の1回限り）。
 * mcframe からエクスポートした「単価情報」を CSV（UTF-8）で読み込み、
 * ブラウザ側で1000行ずつに分割してサーバへ送信する（大容量ファイル対応）。
 * 論理削除行（del_flg≠0）はスキップ。同一データは二重登録されない（冪等）。
 * 実施済みの場合は完了表示のみとし、取込UIは明示操作でのみ開く（誤操作での再実行防止）。
 */

const BATCH_SIZE = 1000;

// 単価情報のヘッダ名（全角/半角ゆらぎを吸収するためのエイリアス）
const COL_ALIASES: Record<string, string[]> = {
  item_cd: ["品目ＣＤ", "品目CD", "itm_cd"],
  item_branch: ["枝番1", "枝番１", "itm_sub1"],
  supplier_cd: ["発注先ＣＤ", "発注先CD", "sppl_cd"],
  unit_cd: ["単位ＣＤ", "単位CD", "unit_cd"],
  lot_qty: ["ロット数", "qty"],
  currency: ["通貨ＣＤ", "通貨CD", "cur_cd"],
  loc_cd: ["納入場所ＣＤ", "納入場所CD", "loc_cd"],
  dlv_cd: ["納品先ＣＤ", "納品先CD", "dlv_cd"],
  wg_cd: ["ワーキンググループＣＤ", "ワーキンググループCD", "wg_cd"],
  start_date: ["適用開始日", "st_dt"],
  end_date: ["適用終了日", "end_dt"],
  price: ["単価", "upri"],
  price_before: ["upri_bf", "改訂前単価"],
  del_flg: ["del_flg", "論理削除"],
  memo1: ["memo1", "メモ１"],
  memo2: ["memo2", "メモ２"],
  memo3: ["memo3", "メモ３"],
};

/** CSVパース（クォート対応・ストリーミング向けに1行ずつ返すシンプル実装） */
function parseCsvText(text: string): string[][] {
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
        } else inQuote = false;
      } else cell += c;
    } else if (c === '"') inQuote = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}

export default function MigrateForm({
  migrated,
  migratedCount,
  migratedAt,
}: {
  /** 初期データ移行が実施済みか（実施済みなら取込UIは既定で隠す） */
  migrated: boolean;
  migratedCount: number;
  migratedAt: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // 実施済みの場合、取込UIは明示的に開いたときだけ表示する（誤操作での再実行を防ぐ）
  const [reopened, setReopened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    total: number;
    sent: number;
    inserted: number;
    skipped: number;
    invalid: number;
    deleted: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState("");

  async function run(file: File) {
    setBusy(true);
    setError("");
    setDone(false);
    setProgress(null);
    try {
      const text = await file.text();
      const rows = parseCsvText(text);
      if (rows.length < 2) {
        setError("データ行がありません（1行目はヘッダにしてください）。");
        return;
      }
      // ヘッダ解決
      const header = rows[0].map((h) => h.trim());
      const colIdx: Record<string, number> = {};
      for (const [key, aliases] of Object.entries(COL_ALIASES)) {
        const idx = header.findIndex((h) => aliases.includes(h));
        if (idx >= 0) colIdx[key] = idx;
      }
      for (const required of ["item_cd", "supplier_cd", "start_date", "price"]) {
        if (colIdx[required] == null) {
          setError(
            `ヘッダに必要な列が見つかりません（${COL_ALIASES[required][0]}）。単価情報のエクスポートをCSV保存したファイルを指定してください。`
          );
          return;
        }
      }
      const get = (r: string[], key: string) => {
        const i = colIdx[key];
        return i == null ? "" : (r[i] ?? "").trim();
      };

      // 論理削除行を除外して送信対象を作る
      const data = rows.slice(1);
      let deleted = 0;
      const payload: Record<string, string>[] = [];
      for (const r of data) {
        const del = get(r, "del_flg");
        if (del && del !== "0") {
          deleted++;
          continue;
        }
        payload.push({
          item_cd: get(r, "item_cd"),
          item_branch: get(r, "item_branch"),
          supplier_cd: get(r, "supplier_cd"),
          unit_cd: get(r, "unit_cd"),
          lot_qty: get(r, "lot_qty"),
          currency: get(r, "currency"),
          loc_cd: get(r, "loc_cd"),
          dlv_cd: get(r, "dlv_cd"),
          wg_cd: get(r, "wg_cd"),
          start_date: get(r, "start_date"),
          end_date: get(r, "end_date"),
          price: get(r, "price"),
          price_before: get(r, "price_before"),
          memo1: get(r, "memo1"),
          memo2: get(r, "memo2"),
          memo3: get(r, "memo3"),
        });
      }

      const p = { total: payload.length, sent: 0, inserted: 0, skipped: 0, invalid: 0, deleted };
      setProgress({ ...p });

      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        const res = await fetch("/api/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(`${i + 1}行目付近で失敗: ${result.error ?? res.statusText}（ここまでの取込は保存済み。再実行すると続きから冪等に取り込めます）`);
          return;
        }
        p.sent += batch.length;
        p.inserted += result.inserted ?? 0;
        p.skipped += result.skipped ?? 0;
        p.invalid += result.invalid ?? 0;
        setProgress({ ...p });
      }
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "移行に失敗しました。");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0;

  // 実施済み かつ 再実行を明示的に開いておらず、今回の取込も走っていない場合は完了表示のみ
  const showUploader = !migrated || reopened || busy || progress != null || done;

  return (
    <div className="space-y-4">
      {/* 実施済みの案内（この作業は運用開始時の1回限り） */}
      {migrated && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            初期データ移行は完了しています
          </h2>
          <p className="mt-2 text-sm text-emerald-800">
            過去の単価履歴 {migratedCount.toLocaleString()} 件を取り込み済みです
            {migratedAt ? `（最終実施: ${formatDateTime(migratedAt)}）` : ""}。
            この作業は運用開始時の1回のみで、以後の単価は「単価申請 → 承認」で単価履歴に積み上がります。
          </p>
          {!showUploader && (
            <button
              onClick={() => setReopened(true)}
              className="mt-3 text-xs text-emerald-800 underline hover:text-emerald-900"
            >
              取り込み漏れがあった場合はこちら（追加分のみ取り込みます）
            </button>
          )}
        </div>
      )}

      {showUploader && (
      <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="mb-2 text-sm font-bold text-[#333333]">
          {migrated ? "追加取り込み（取り込み漏れの補完）" : "単価情報（mcframe）の取り込み"}
        </h2>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-[#707070]">
          <li>mcframe からエクスポートした「単価情報」の Excel を開き、「CSV UTF-8（コンマ区切り）」で保存します。</li>
          <li>保存した CSV を下で選択すると、1,000行ずつ自動送信されます（21万行で数分程度）。送信中はこのページを開いたままにしてください。</li>
          <li>論理削除行（del_flg≠0）はスキップされます。既に取り込んだ行は二重登録されないため、同じファイルを選び直しても安全です。</li>
        </ol>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void run(f);
          }}
          className="block w-full max-w-md text-sm text-[#555555] file:mr-3 file:rounded-lg file:border-0 file:bg-[#fff1f2] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#e11d48] hover:file:bg-[#ffe4e6]"
        />

        {busy && !progress && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[#707070]">
            <Loader2 className="h-4 w-4 animate-spin" />
            ファイルを解析中…（大きいファイルは少し時間がかかります）
          </div>
        )}

        {progress && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-[#707070]">
              <span>
                {progress.sent.toLocaleString()} / {progress.total.toLocaleString()} 行 送信済み
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#eeeeee]">
              <div className="h-full bg-[#e11d48] transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 text-xs text-[#707070]">
              登録 {progress.inserted.toLocaleString()} 件 / 既存スキップ {progress.skipped.toLocaleString()} 件
              / 不正行 {progress.invalid.toLocaleString()} 件 / 論理削除スキップ {progress.deleted.toLocaleString()} 件
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {done && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <DatabaseZap className="h-4 w-4" />
            移行が完了しました。単価履歴から確認できます。この作業は以後不要です。
          </div>
        )}
      </div>
      )}

      {/* 名称補完 */}
      <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="mb-2 text-sm font-bold text-[#333333]">品名・取引先名の補完</h2>
        <p className="mb-3 text-sm text-[#707070]">
          単価情報には品名・発注先名が含まれないため、移行直後は名称が空欄です。
          品番マスタ・取引先マスタを取り込んだ後にこのボタンを押すと、履歴の名称をマスタから補完します
          （何度実行しても安全です）。
        </p>
        <button
          disabled={busy}
          onClick={() => {
            setBackfillMsg("");
            backfillNamesAction()
              .then((r) => {
                setBackfillMsg(`補完しました（品名 ${r.items.toLocaleString()} 件・取引先名 ${r.suppliers.toLocaleString()} 件）。`);
                router.refresh();
              })
              .catch((e) => setBackfillMsg(e instanceof Error ? e.message : "補完に失敗しました"));
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-[#e11d48] px-4 py-2 text-sm font-semibold text-[#e11d48] hover:bg-[#fff1f2] disabled:opacity-50"
        >
          <Wand2 className="h-4 w-4" />
          マスタから名称を補完する
        </button>
        {backfillMsg && <p className="mt-2 text-sm text-emerald-700">{backfillMsg}</p>}
      </div>

      <p className="text-xs text-[#a0a0a0]">
        移行済みの履歴件数: {migratedCount.toLocaleString()} 件
      </p>
    </div>
  );
}
