import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { listLocations } from "@/lib/db";
import { upsertLocationAction } from "@/lib/actions";
import PageHeader from "@/components/PageHeader";
import ImportPanel from "@/components/ImportPanel";
import LocationRow from "@/components/LocationRow";
import SearchBox from "@/components/SearchBox";
import SeedLocationsButton from "@/components/SeedLocationsButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

/**
 * 納入場所マスタ（納入場所CD → 名称）。
 * 単価は品目×取引先×納入場所ごとに登録されるため、CDだけでは分かりにくい画面表示を
 * ここで登録した名称で補う。移行データ・単価改訂履歴の取込時にも自動で登録される。
 */
export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await requireAdminPage();
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const { rows, total } = await listLocations(session.companyId, {
    q: q || null,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inputCls = "w-full rounded border border-[#d5d5d5] px-2 py-1.5 text-sm";
  const noName = rows.filter((r) => !r.name).length;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader
        title="納入場所マスタ"
        description={`納入場所CDと名称の対応（全 ${total.toLocaleString()} 件）。単価履歴・単価申請の画面で、CDのとなりに名称を表示します。`}
      />

      <ImportPanel kinds={["locations"]} title="Excel/CSVで納入場所マスタを一括登録" />

      {/* 過去の単価履歴に出てくるCDをまとめて登録する（名称は後から編集で補完） */}
      <div className="mb-4 rounded-xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="text-sm font-bold text-[#333333]">単価履歴から登録</h2>
        <p className="mb-2 text-xs text-[#a0a0a0]">
          移行済みの単価履歴に出てくる納入場所CDを、まとめてマスタに登録します（登録済みのCDはそのまま）。
          名称は一覧の鉛筆アイコンから入力するか、初期データ移行の「単価改訂履歴の理由を反映」を再実行すると納入場所名の分かる行に入ります。
        </p>
        <SeedLocationsButton />
      </div>

      {/* 追加・更新フォーム */}
      <form
        action={upsertLocationAction}
        className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-[#e5e5e5] bg-white p-4 sm:grid-cols-4"
      >
        <div className="sm:col-span-4">
          <h2 className="text-sm font-bold text-[#333333]">納入場所を追加</h2>
          <p className="text-xs text-[#a0a0a0]">
            既に登録済みの納入場所CDを入力すると、その名称を上書きします。登録後の修正は一覧の鉛筆アイコンから行えます。
          </p>
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">納入場所CD *</label>
          <input name="code" required className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">納入場所名 *</label>
          <input name="name" required className={inputCls} />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] font-medium text-[#707070]">備考</label>
          <input name="notes" className={inputCls} />
        </div>
        <div className="flex items-end">
          <button className="w-full rounded-lg bg-[#e11d48] px-4 py-2 text-sm font-semibold text-white hover:bg-[#be123c]">
            登録 / 更新
          </button>
        </div>
      </form>

      <SearchBox action="/locations" q={q} total={total} placeholder="納入場所CD・名称で検索" />

      {noName > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          名称が未登録の納入場所が {noName.toLocaleString()} 件あります（移行データからCDだけ取り込まれたものです）。
          鉛筆アイコンから名称を入力してください。
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#707070]">
          {q ? "該当する納入場所がありません。" : "納入場所がまだ登録されていません。上のフォームか一括登録から追加してください。"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#e5e5e5] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#eeeeee] text-left text-xs text-[#707070]">
                <th className="px-2 py-2.5 font-medium">納入場所CD</th>
                <th className="px-2 py-2.5 font-medium">納入場所名</th>
                <th className="px-2 py-2.5 font-medium">備考</th>
                <th className="px-2 py-2.5 font-medium">状態</th>
                <th className="px-2 py-2.5 text-right font-medium">単価履歴</th>
                <th className="px-2 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <LocationRow key={l.id} loc={l} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={`/locations?${new URLSearchParams({ q, page: String(page - 1) }).toString()}`}
              className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]"
            >
              ← 前へ
            </Link>
          )}
          <span className="text-[#707070]">
            {page} / {pages} ページ
          </span>
          {page < pages && (
            <Link
              href={`/locations?${new URLSearchParams({ q, page: String(page + 1) }).toString()}`}
              className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 hover:bg-[#f7f7f5]"
            >
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
