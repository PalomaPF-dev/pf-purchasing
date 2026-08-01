import { requireSession } from "@/lib/session";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; body: (string | { list: string[] })[] }[] = [
  {
    title: "このアプリでできること",
    body: [
      { list: [
        "購入品単価の登録申請（取引先ごと・品目ごと）と改訂履歴・改訂理由の管理",
        "申請 → MGR承認 → 部門長承認 の2段階ワークフロー（承認用紙のPDF出力つき）",
        "見積書（PDF/画像）のAI読み取りによる申請フォームへの自動入力",
        "Excel/CSVによる単価申請の一括取込、品番・取引先マスタの一括登録",
        "承認後の単価を mcframe 取込フォーマット（MC取込CSV）で出力",
        "mcframe からエクスポートした現行単価履歴（単価情報）のデータ移行",
      ] },
    ],
  },
  {
    title: "単価申請の流れ",
    body: [
      "1. 「単価申請」→「新規申請」で明細を入力します。品目CD・発注先CDを入れると、マスタ・単価履歴から品名や現行単価を自動補完できます。",
      "2. 見積書がある場合は「見積書から自動入力」でPDF/画像を読み取り、明細に反映できます（内容は必ず確認してください）。",
      "3. 単価差の内訳（支給材建値・材料建値・単価改定・設計変更・為替変動・その他）と備考（改訂理由）を入力します。内訳の合計は単価差と一致している必要があります。",
      "4. 「申請を提出」すると承認へ回ります。承認者（管理者）はMGR承認 → 部門長承認の順に処理し、差し戻しもできます。",
      "5. 部門長承認が完了すると、単価履歴に自動反映されます。",
    ],
  },
  {
    title: "承認用紙（PDF）",
    body: [
      "申請詳細の「承認用紙（PDF）」から、現行の紙帳票（単価申請内訳）と同じレイアウトの帳票を表示できます。承認済みの場合は右上に承認印（担当・MGR・部門長）が入ります。",
      "ブラウザの印刷（Ctrl/Cmd + P）で「PDFに保存」を選ぶとPDFファイルとして出力できます。明細ごとに1ページ、直近申請内容（前回の改訂）も並記されます。",
    ],
  },
  {
    title: "MC取込CSV（mcframe連携）",
    body: [
      "「MC取込出力」で承認済みの明細を選択してCSVをダウンロードします。フォーマットはMC取込フォーマット（1行目=項目キー、2行目=日本語ラベル、3行目以降=データ）と同一です。",
      "出力時に「出力済み」を記録すると、次回は未出力の明細だけが表示されます（再出力も可能です）。",
    ],
  },
  {
    title: "データ移行（初期セットアップ）",
    body: [
      "「データ移行」で mcframe からエクスポートした単価情報（CSV UTF-8保存）を取り込むと、現行の単価履歴を引き継いだ状態で運用を開始できます。",
      "単価情報には品名・発注先名が含まれないため、品番マスタ・取引先マスタを取り込んだ後に「マスタから名称を補完する」を実行してください。",
    ],
  },
  {
    title: "権限",
    body: [
      { list: [
        "一般（member）: 申請の作成・提出、単価履歴の閲覧",
        "管理者（admin): 上記に加え、承認・差し戻し、マスタ管理、一括取込、MC出力、データ移行",
      ] },
    ],
  },
];

/** 使い方ガイド */
export default async function GuidePage() {
  await requireSession();
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <PageHeader title="使い方" description="PF購買単価の基本操作ガイド" />
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <section key={s.title} className="rounded-xl border border-[#e5e5e5] bg-white p-5">
            <h2 className="mb-3 text-sm font-bold text-[#333333] after:mt-1.5 after:block after:h-[3px] after:w-8 after:rounded-full after:bg-[#e11d48] after:content-['']">
              {s.title}
            </h2>
            <div className="space-y-2 text-sm leading-relaxed text-[#555555]">
              {s.body.map((b, i) =>
                typeof b === "string" ? (
                  <p key={i}>{b}</p>
                ) : (
                  <ul key={i} className="list-disc space-y-1 pl-5">
                    {b.list.map((li) => (
                      <li key={li}>{li}</li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
