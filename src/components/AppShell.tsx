"use client";

import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FileText,
  Stamp,
  History,
  Package,
  Building2,
  Upload,
  Download,
  DatabaseZap,
  LogOut,
  Mail,
  BookOpen,
} from "lucide-react";
import { AppShell as BaseAppShell, type NavItem } from "@paloma-pf/ui";

const NAV: NavItem[] = [
  { href: "/", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/requests", label: "単価申請", icon: FileText },
  { href: "/approvals", label: "承認", icon: Stamp, adminOnly: true },
  { href: "/prices", label: "単価履歴", icon: History },
  { href: "/items", label: "品番マスタ", icon: Package, adminOnly: true },
  { href: "/suppliers", label: "取引先マスタ", icon: Building2, adminOnly: true },
  { href: "/import", label: "一括取込", icon: Upload, adminOnly: true },
  { href: "/export", label: "MC取込出力", icon: Download, adminOnly: true },
  { href: "/migrate", label: "データ移行", icon: DatabaseZap, adminOnly: true },
  { href: "/guide", label: "使い方", icon: BookOpen },
];

/** 購買単価アプリのテーマ（ブルー、アクティブは角丸＋丸バー）。 */
const ACCENT = "#e11d48";

/** ログインユーザー表示とログアウト。next-auth 依存のためアプリ側に置く。 */
function UserFooter() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  return (
    <div className="mt-auto border-t border-[#e5e5e5] px-4 py-3">
      <div className="mb-2 truncate text-xs text-[#707070]">
        {session.user.companyName}
        <span className="mx-1 text-slate-300">/</span>
        {session.user.name}
      </div>
      {/* ポータルのお問い合わせフォーム（このアプリを選択した状態で開く） */}
      <a
        href="https://portal.paloma-pf.com/?contact=purchasing"
        target="_blank"
        rel="noopener noreferrer"
        className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] px-3 py-2 text-xs font-medium text-[#555555] hover:bg-[#f7f7f5]"
      >
        <Mail className="h-4 w-4" />
        お問い合わせ
      </a>
      <button
        onClick={() => {
          void signOut({ redirect: false }).then(() => {
            window.location.href = "https://portal.paloma-pf.com/";
          });
        }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#e5e5e5] px-3 py-2 text-xs font-medium text-[#555555] hover:bg-[#f7f7f5]"
      >
        <LogOut className="h-4 w-4" />
        ログアウト
      </button>
    </div>
  );
}

/**
 * 購買単価アプリのシェル。共通の @paloma-pf/ui の AppShell に、
 * このアプリ固有のナビ・テーマ・ユーザー情報を差し込む。
 * 認証前ページ（/login 等）と印刷ページはシェルなしで描画する。
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isAdmin = session?.user?.role === "admin";
  // 認証前ページ・帳票印刷ページはサイドバーなし
  const bare =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/password-reset") ||
    /\/print$/.test(pathname);
  if (bare) return <>{children}</>;
  return (
    <BaseAppShell
      nav={NAV}
      brand={{ eyebrow: "株式会社パロマ", title: "PF購買単価" }}
      isAdmin={isAdmin}
      accent={ACCENT}
      navIndicator="pill"
      background="#f7f7f5"
      sidebarFooter={<UserFooter />}
    >
      {children}
    </BaseAppShell>
  );
}
