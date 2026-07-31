import { NextResponse } from "next/server";
import { confirmPasswordReset } from "@/lib/passwordReset";

export const runtime = "nodejs";

/** 招待リンク（パスワード設定リンク）からのパスワード設定。 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token || !password) {
    return NextResponse.json({ message: "不正なリクエストです。" }, { status: 400 });
  }
  try {
    const err = await confirmPasswordReset(token, password);
    if (err) return NextResponse.json({ message: err }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[password-reset/confirm]", e);
    return NextResponse.json({ message: "パスワードの設定に失敗しました。" }, { status: 500 });
  }
}
