import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./authOptions";
import { getUserRole } from "./authDb";

export interface AppSession {
  companyId: string;
  companyName: string;
  userId: string;
  userName: string;
  role: "admin" | "member";
  /** 社員番号（申請者・承認者の識別子） */
  loginId: string | null;
}

/**
 * ログイン中の会社ID・会社名・ユーザー名・役割を返す。
 * 未ログインなら /login にリダイレクト（Server Component / Server Action 用）。
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    redirect("/login");
  }
  return {
    companyId: session.user.companyId,
    companyName: session.user.companyName,
    userId: session.user.id,
    userName: session.user.name ?? "",
    role: session.user.role ?? "member",
    loginId: session.user.loginId ?? null,
  };
}

/**
 * 管理者（role=admin）のみ許可。承認・マスタ管理・取込/出力の Server Action で使う。
 * 一般ユーザーはエラー（UI 側でもボタンを出さないが、サーバー側でも必ず防ぐ）。
 */
export async function requireAdminSession(): Promise<AppSession> {
  const s = await requireSession();
  if (s.role !== "admin") {
    throw new Error("この操作は管理者のみ実行できます");
  }
  return s;
}

/**
 * マスタ系ページ用: ログインに加えて管理者（role=admin）を要求。
 * 一般ユーザー（member）は "/" にリダイレクトして描画させない。
 */
export async function requireAdminPage(): Promise<AppSession> {
  const s = await requireSession();
  if (s.role !== "admin") {
    // 無言で戻すと理由が分からないため、ダッシュボードで案内を表示する
    redirect("/?forbidden=1");
  }
  return s;
}

/**
 * ログイン中のセッション＋役割を返す。未ログインなら null。
 * リダイレクトしないので、API route 側で 401/403 を返せる。
 * role は DB から都度取得する（既存セッションでも即時反映される）。
 */
export async function getSessionWithRole(): Promise<AppSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) return null;
  const role = await getUserRole(session.user.companyId, session.user.id);
  return {
    companyId: session.user.companyId,
    companyName: session.user.companyName,
    userId: session.user.id,
    userName: session.user.name ?? "",
    role: role ?? "member",
    loginId: session.user.loginId ?? null,
  };
}
