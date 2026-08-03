import Link from "next/link";
import { Search, X } from "lucide-react";

/**
 * 単価履歴の項目別検索。
 * 品目CD・品名・取引先・納入場所を別々に指定して絞り込む（併用は AND）。
 * 並び替え（sort/dir）は検索してもそのまま引き継ぐ。
 */
export default function PriceFilters({
  values,
  q,
  activeOnly,
  sort,
  dir,
}: {
  values: { itemQ: string; itemNameQ: string; supplierQ: string; locQ: string; reasonQ: string };
  /** まとめ検索の語（この絞り込みと併用する） */
  q: string;
  activeOnly: boolean;
  sort: string;
  dir: string;
}) {
  const has = Object.values(values).some((v) => v !== "");
  const input =
    "w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm focus:border-[#e11d48] focus:outline-none";
  const fields: { name: keyof typeof values; label: string; placeholder: string; mono?: boolean }[] =
    [
      { name: "itemQ", label: "品目CD", placeholder: "例: 760315", mono: true },
      { name: "itemNameQ", label: "品名", placeholder: "例: ﾎﾞｳﾊﾝﾀﾞ" },
      { name: "supplierQ", label: "取引先（CD・名称）", placeholder: "例: 岡谷" },
      { name: "locQ", label: "納入場所（CD・名称）", placeholder: "例: 直方" },
      { name: "reasonQ", label: "備考（改訂理由）", placeholder: "例: 銅建値" },
    ];

  return (
    <form
      action="/prices"
      method="GET"
      className="mb-4 rounded-xl border border-[#e5e5e5] bg-white p-4"
    >
      {q && <input type="hidden" name="q" value={q} />}
      {activeOnly && <input type="hidden" name="active" value="1" />}
      {sort && <input type="hidden" name="sort" value={sort} />}
      {dir && <input type="hidden" name="dir" value={dir} />}
      <div className="mb-2 text-sm font-bold text-[#333333]">項目で絞り込む</div>
      <div className="grid gap-2 sm:grid-cols-5">
        {fields.map((f) => (
          <div key={f.name}>
            <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">{f.label}</label>
            <input
              name={f.name}
              defaultValue={values[f.name]}
              placeholder={f.placeholder}
              className={`${input}${f.mono ? " font-mono" : ""}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#e11d48] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#be123c]"
        >
          <Search className="h-4 w-4" />
          この条件で検索
        </button>
        {has && (
          <Link
            href={`/prices${(() => {
              const p = new URLSearchParams();
              if (q) p.set("q", q);
              if (activeOnly) p.set("active", "1");
              if (sort) p.set("sort", sort);
              if (dir) p.set("dir", dir);
              const s = p.toString();
              return s ? `?${s}` : "";
            })()}`}
            className="inline-flex items-center gap-1 rounded-lg border border-[#d5d5d5] bg-white px-3 py-1.5 text-sm text-[#555555] hover:bg-[#f7f7f5]"
          >
            <X className="h-4 w-4" />
            条件をすべて解除
          </Link>
        )}
        <span className="text-xs text-[#a0a0a0]">
          複数の項目を入れると、すべてに当てはまるものを表示します。
        </span>
      </div>
    </form>
  );
}
