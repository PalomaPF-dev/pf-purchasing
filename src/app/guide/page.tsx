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
      "2. 見積書がある場合は「見積書から取り込む」で Excel（.xlsx/.xlsm）・PDF（スキャン画像も可）・画像を読み取れます。複数ファイルをまとめてドロップでき、読み取り結果はプレビューで確認・修正し、取り込む明細を選んでから反映します。",
      "3. 単価差の内訳（支給材建値・材料建値・単価改定・設計変更・為替変動・その他）と備考（改訂理由）を入力します。内訳の合計は単価差と一致している必要があります。",
      "4. 「申請を提出」すると承認へ回ります。承認者（管理者）はMGR承認 → 部門長承認の順に処理し、差し戻しもできます。",
      "5. 部門長承認が完了すると、単価履歴に自動反映されます。",
    ],
  },
  {
    title: "承認用紙（PDF）",
    body: [
      "申請詳細の「承認用紙（PDF）」から、単価申請書（登録品単価連絡書）を表示できます。1行＝1品番で「新単価（適用日・単価・支給単価・買入単価）」と「旧単価（取消日・単価・買入単価）」を左右に並べ、新旧の対比が一目で分かる様式です。承認済みの場合は右上の承認欄（部門長・MGR・担当）に承認印が入ります。",
      "ブラウザの印刷（Ctrl/Cmd + P）で「PDFに保存」を選ぶとPDFファイルとして出力できます。単価差の内訳（改訂理由別）は下部に一覧で並記されます。",
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
    title: "初期データ移行（運用開始時の1回のみ）",
    body: [
      "「初期データ移行」は、運用開始時に過去の単価履歴を引き継ぐための一度きりの作業です。mcframe からエクスポートした単価情報（CSV UTF-8保存）を取り込みます。",
      "移行後は、単価の登録・改訂はすべて「単価申請 → MGR承認 → 部門長承認」で行い、承認された単価が単価履歴に積み上がっていきます。日常運用でこの画面を使うことはありません。",
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
