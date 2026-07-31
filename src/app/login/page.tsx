"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

// useSearchParams はプリレンダー時に Suspense 境界が必要
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ログイン後の戻り先（オープンリダイレクト防止でアプリ内パスのみ許可）
  const rawCallback = searchParams.get("callbackUrl") ?? "";
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/";
  const ssoError = searchParams.get("error") === "sso";

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 戻る操作などでページが復元されたとき「ログイン中…」のまま残る状態バグを防ぐ
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setLoading(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // フィールド名 email は PF 家族共通の互換のため（値は社員番号）
    const res = await signIn("credentials", { email: loginId, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError(
        res.error === "CredentialsSignin" ? "社員番号またはパスワードが違います。" : res.error
      );
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5]">
      <div className="h-1 shrink-0 bg-[#2563eb]" />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-[#e5e5e5] bg-white px-8 py-8">
            <div className="mb-6 flex flex-col items-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon-192.png" alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl" />
              <p className="text-xs tracking-wide text-[#707070]">生産・調達統括本部</p>
              <h1 className="text-xl font-bold text-[#333333]">PF購買単価</h1>
              <p className="mt-1 text-xs text-[#707070]">購入品単価の登録・承認・履歴管理</p>
            </div>

            {ssoError && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                ポータルからの自動ログインに失敗しました。社員番号とパスワードでログインしてください。
              </div>
            )}

            <h2 className="mb-6 text-lg font-semibold text-[#333333] after:mt-2 after:block after:h-[3px] after:w-8 after:rounded-full after:bg-[#2563eb] after:content-['']">
              ログイン
            </h2>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#333333]">社員番号</label>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                  placeholder="例: 12345（管理者は admin）"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#333333]">パスワード</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                  placeholder="••••••••"
                />
              </div>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1d4fd8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "ログイン中…" : "ログイン"}
              </button>
            </form>

            {/* ポータル一括ログイン（ポータルでログイン済みなら各アプリは自動ログイン） */}
            <div className="mt-4 rounded-lg border border-[#2563eb]/40 bg-[#eef4ff] px-3 py-2.5 text-center text-sm">
              <a
                href="https://portal.paloma-pf.com/"
                className="font-semibold text-[#2563eb] hover:underline"
              >
                ポータルから一括ログイン
              </a>
            </div>
            <p className="mt-2 text-center text-xs text-[#707070]">
              ポータルでログインすると各アプリは自動でログインされます
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-[#707070]">
            購入品単価の申請・承認（W/F）・改訂履歴・mcframe取込データ出力を一元管理する社内ツール
          </p>
          <div className="mt-3 text-center">
            <a
              href="https://portal.paloma-pf.com"
              className="text-sm text-[#707070] transition-colors hover:text-[#2563eb]"
            >
              ← ポータルへ戻る
            </a>
          </div>
        </div>
      </div>
      <footer className="bg-[#323232] py-4 text-center text-[11px] tracking-[0.08em] text-white/75">
        株式会社パロマ 生産・調達統括本部
      </footer>
    </div>
  );
}
