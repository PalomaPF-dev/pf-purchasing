"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, Loader2 } from "lucide-react";

export type ImportKind = "prices" | "items" | "suppliers" | "supplier-contacts" | "history-reasons";
type Kind = ImportKind;

const KIND_INFO: Record<Kind, { label: string; note: string }> = {
  prices: {
    label: "単価申請の一括取込",
    note: "1ファイル＝1申請（下書き）として取り込みます。取込後、内容を確認して提出（承認へ回す）してください。",
  },
  items: {
    label: "品番マスタの一括登録",
    note: "品目CD＋枝番が同じ既存データは上書き（更新）されます。",
  },
  suppliers: {
    label: "取引先マスタの一括登録",
    note: "取引先CDが同じ既存データは上書き（更新）されます。",
  },
  "history-reasons": {
    label: "単価改訂履歴の理由",
    note: "mcframe の単価改訂履歴（理由つき）を取り込み、既に移行済みの単価履歴に「備考（改訂理由）」と単価差の内訳（材料建値・単価改定・設計変更・為替変動・その他）を反映します。ファイルに品名・取引先名があれば、移行で名称が空のままの品番マスタ・取引先マスタにも補完します。品目CD・取引先CD・納入場所CD・開始日が一致する履歴を更新するだけで、新しい履歴は作りません。",
  },
  "supplier-contacts": {
    label: "取引先の担当窓口",
    note: "「取引先CD／取引先名／企画グループ／管理グループ」の一覧をそのまま取り込みます。氏名は社員マスタ（ユーザー登録）で社員番号に名寄せします（先に社員を登録してください）。「町野 真一（髙橋 彩佳）」のような併記は主担当・副担当に分解します。",
  },
};

/**
 * Excel/CSV 取込フォーム。各マスタ画面に埋め込んで使う。
 * kinds を複数渡すとタブで切り替えられる（取引先マスタ＋担当窓口など）。
 */
export default function ImportForm({ kinds }: { kinds: ImportKind[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(kinds[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function run() {
    if (!file) {
      setError("ファイルを選択してください。");
      return;
    }
    setBusy(true);
    setError("");
    setResult("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await fetch("/api/import-excel", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "取込に失敗しました。");
        return;
      }
      if (kind === "prices" && data.requestId) {
        setResult(`${data.count} 件の明細を取り込みました。申請画面に移動します…`);
        setTimeout(() => router.push(`/requests/${data.requestId}`), 800);
      } else if (kind === "history-reasons") {
        const names =
          data.itemNames || data.supplierNames
            ? `あわせて品名 ${data.itemNames ?? 0} 件・取引先名 ${data.supplierNames ?? 0} 件をマスタに補完しました。`
            : "";
        setResult(`${data.count} 件の単価履歴に改訂理由・内訳を反映しました。${names}`);
        router.refresh();
      } else if (kind === "supplier-contacts") {
        setResult(
          `${data.count} 件を取り込みました（新規 ${data.created ?? 0} 件 / 更新 ${data.updated ?? 0} 件）。`
        );
        router.refresh();
      } else {
        setResult(`${data.count} 件を登録しました。`);
        router.refresh();
      }
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        const head =
          kind === "supplier-contacts"
            ? "未反映の担当"
            : kind === "history-reasons"
              ? "未反映"
              : "スキップした行";
        setError(`${head}: ${data.errors.slice(0, 5).join(" / ")}${data.errors.length > 5 ? ` 他${data.errors.length - 5}件` : ""}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 取込の種類（1種類だけならタブは出さない） */}
      <div className={`flex flex-wrap gap-2 ${kinds.length < 2 ? "hidden" : ""}`}>
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setResult("");
              setError("");
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              kind === k
                ? "bg-[#e11d48] text-white"
                : "border border-[#e5e5e5] bg-white text-[#555555] hover:bg-[#f7f7f5]"
            }`}
          >
            {KIND_INFO[k].label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
        <p className="mb-4 text-sm text-[#707070]">{KIND_INFO[kind].note}</p>

        <a
          href={`/api/import-excel?template=${kind}`}
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-[#e11d48] hover:underline"
        >
          <Download className="h-4 w-4" />
          取込テンプレート（CSV）をダウンロード
        </a>

        <div className="mb-4">
          <input
            type="file"
            accept=".xlsx,.csv,.tsv,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full max-w-md text-sm text-[#555555] file:mr-3 file:rounded-lg file:border-0 file:bg-[#fff1f2] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#e11d48] hover:file:bg-[#dbe8ff]"
          />
          <p className="mt-1 text-xs text-[#a0a0a0]">Excel (.xlsx) または CSV。1行目はヘッダ。最大4MB。</p>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        )}
        {result && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {result}
          </div>
        )}

        <button
          onClick={() => void run()}
          disabled={busy || !file}
          className="inline-flex items-center gap-2 rounded-lg bg-[#e11d48] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
          {busy ? "取込中…" : "取込を実行"}
        </button>
      </div>
    </div>
  );
}
