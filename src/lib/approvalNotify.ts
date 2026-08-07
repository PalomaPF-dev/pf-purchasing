/**
 * 申請が出たときに、承認者へ LINE WORKS で通知する（ポータル経由）。
 *
 * 誰に送るかはポータルが決める（承認者 → 職場の管理者 → 部署の管理者の順に、
 * LINE WORKS が設定されている人を探す）。このアプリは「誰の申請か」を渡すだけでよい。
 * 仕様は pf-portal の docs/lineworks.md を参照。
 *
 * 通知の失敗で申請を失敗させないこと。呼び出し側は await せず投げっぱなしにする。
 */

const PORTAL_ORIGIN = (process.env.PORTAL_ORIGIN ?? "https://portal.paloma-pf.com").replace(/\/+$/, "");
const APP_KEY = "purchasing";
const TIMEOUT_MS = 8000;

/** 申請画面のURL（NEXTAUTH_URL → VERCEL_URL の順。どちらも無ければ付けない）。 */
function requestUrl(requestId: string): string | undefined {
  const base = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!base.startsWith("https://")) return undefined; // ローカル開発では付けない（外から開けないため）
  return `${base.replace(/\/$/, "")}/requests/${requestId}`;
}

/**
 * 承認者へ通知する。失敗しても例外を投げない（申請自体は成立させる）。
 * @param applicantLoginId 申請者の社員番号（ポータルの login_id）。
 *   ポータル未連携のアカウントでは null になり得る。その場合は誰の申請か特定できないので送らない。
 */
export function notifyApprovalRequested(applicantLoginId: string | null, requestId: string): void {
  const key = (process.env.PF_PROVISION_KEY ?? "").trim();
  if (!key || !applicantLoginId) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  void fetch(`${PORTAL_ORIGIN}/api/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      approvalFor: applicantLoginId,
      app: APP_KEY,
      url: requestUrl(requestId),
    }),
    signal: controller.signal,
    cache: "no-store",
  })
    .then(async (r) => {
      if (!r.ok) {
        console.error("[approvalNotify] ポータルが拒否:", r.status, (await r.text().catch(() => "")).slice(0, 200));
        return;
      }
      // 宛先が1人もいない場合もポータルは 200 を返す。設定漏れに気付けるよう記録する。
      const d = (await r.json().catch(() => null)) as { sent?: boolean; reason?: string } | null;
      if (d && d.sent === false) {
        console.warn("[approvalNotify] 通知先なし:", applicantLoginId, d.reason);
      }
    })
    .catch((e) => console.error("[approvalNotify] 送信失敗:", e instanceof Error ? e.message : e))
    .finally(() => clearTimeout(timer));
}
