"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

// useSearchParams はプリレンダー時に Suspense 境界が必要
export default function PasswordResetConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  );
}

function ConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== password2) {
      setError("パスワードが一致しません。");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "パスワードの設定に失敗しました。");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5]">
      <div className="h-1 shrink-0 bg-[#2563eb]" />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#e5e5e5] bg-white px-8 py-8">
          <h1 className="mb-1 text-lg font-bold text-[#333333]">パスワードの設定</h1>
          <p className="mb-6 text-xs text-[#707070]">
            PF購買単価にログインするためのパスワードを設定してください（8文字以上）。
          </p>
          {done ? (
            <div className="flex items-start gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              設定しました。ログイン画面に移動します…
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#333333]">新しいパスワード</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[#d5d5d5] px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#333333]">確認（もう一度）</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  className="w-full rounded-lg border border-[#d5d5d5] px-3 py-2 text-sm focus:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
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
                className="w-full rounded-lg bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4fd8] disabled:opacity-50"
              >
                {loading ? "設定中…" : "パスワードを設定する"}
              </button>
            </form>
          )}
        </div>
      </div>
      <footer className="bg-[#323232] py-4 text-center text-[11px] tracking-[0.08em] text-white/75">
        株式会社パロマ 生産・調達統括本部
      </footer>
    </div>
  );
}
