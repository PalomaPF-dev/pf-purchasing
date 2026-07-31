import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getSql } from "./neon";
import { ensureAuthSchema } from "./authDb";

// localhost のクッキーはポートを跨いで共有されるため、既定名のままだと他のPFアプリの
// 開発サーバーと相互上書きになり JWEDecryptionFailed が起きる。アプリ固有名で分離する。
const useSecureCookies =
  (process.env.NEXTAUTH_URL ?? "").startsWith("https://") || process.env.VERCEL === "1";
const securePrefix = useSecureCookies ? "__Secure-" : "";

/**
 * next-auth 設定（PF家族共通：社員番号＋パスワード／Neon の users・companies）。
 * セッションは JWT。companyId 単位でデータをスコープする。
 */
export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name: `${securePrefix}purchasing.session-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    callbackUrl: {
      name: `${securePrefix}purchasing.callback-url`,
      options: { sameSite: "lax", path: "/", secure: useSecureCookies },
    },
    csrfToken: {
      name: `${useSecureCookies ? "__Host-" : ""}purchasing.csrf-token`,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: useSecureCookies },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        // フィールド名は PF 家族共通の互換のため email のまま（値は社員番号 login_id）
        email: { label: "社員番号", type: "text" },
        password: { label: "パスワード", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const sql = getSql();
        // 初回アクセスや env 追加直後でもログインできるよう冪等に整える。失敗しても続行。
        try {
          await ensureAuthSchema();
        } catch {
          /* スキーマ初期化の一時失敗ではログイン自体は止めない */
        }
        const loginId = credentials.email.trim();
        let rows;
        try {
          rows = await sql`
            SELECT u.id, u.login_id, u.email, u.name, u.password_hash, u.role, u.pending,
                   c.id AS company_id, c.name AS company_name
            FROM users u
            JOIN companies c ON c.id = u.company_id
            WHERE u.login_id = ${loginId}
            LIMIT 1
          `;
        } catch {
          return null;
        }
        const user = rows[0];
        if (!user) return null;
        if (user.pending) {
          throw new Error(
            "初回ログインのため、パスワードの設定が必要です。招待リンク（パスワード設定リンク）からパスワードを設定してください。"
          );
        }
        const valid = await bcrypt.compare(credentials.password, user.password_hash as string);
        if (!valid) return null;
        return {
          id: user.id as string,
          email: (user.email ?? null) as string | null,
          name: user.name as string,
          companyId: user.company_id as string,
          companyName: user.company_name as string,
          role: (user.role ?? "member") as "admin" | "member",
          loginId: (user.login_id ?? null) as string | null,
        };
      },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.companyId = user.companyId;
        token.companyName = user.companyName;
        token.role = user.role;
        token.loginId = user.loginId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.companyId = token.companyId as string;
        session.user.companyName = token.companyName as string;
        session.user.role = (token.role ?? "member") as "admin" | "member";
        session.user.loginId = (token.loginId ?? null) as string | null;
      }
      return session;
    },
  },

  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};
