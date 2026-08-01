"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

/** 初期セットアップ（最初の管理者の作成）。管理者が居るDBでは実行できない。 */
export default function RegisterPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, name, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "登録に失敗しました。");
        return;
      }
      const login = await signIn("credentials", { email: loginId, password, redirect: false });
      if (login?.error) {
        router.push("/login");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const input =
    "w-full rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-sm focus:border-[#e11d48] focus:outline-none focus:ring-1 focus:ring-[#e11d48]";

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5]">
      <div className="h-1 shrink-0 bg-[#e11d48]" />
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-[#e5e5e5] bg-white px-8 py-8">
          <h1 className="mb-1 text-lg font-bold text-[#333333]">初期セットアップ</h1>
          <p className="mb-6 text-xs text-[#707070]">
            最初の管理者アカウントを作成します（既に管理者が居る場合は実行できません）。
          </p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#333333]">社員番号</label>
              <input required value={loginId} onChange={(e) => setLoginId(e.target.value)} className={input} placeholder="例: admin または 12345" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#333333]">お名前</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="例: 山田 太郎" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#333333]">パスワード（8文字以上）</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
            </div>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#e11d48] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#be123c] disabled:opacity-50"
            >
              {loading ? "作成中…" : "管理者を作成してはじめる"}
            </button>
          </form>
        </div>
      </div>
      <footer className="bg-[#323232] py-4 text-center text-[11px] tracking-[0.08em] text-white/75">
        株式会社パロマ 生産・調達統括本部
      </footer>
    </div>
  );
}
