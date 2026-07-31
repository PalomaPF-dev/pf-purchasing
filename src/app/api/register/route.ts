import { NextResponse } from "next/server";
import { countAllAdmins, createUser, getOrCreateCompanyByName, loginIdExists } from "@/lib/authDb";
import { ensureSchema } from "@/lib/schema";

export const runtime = "nodejs";

/**
 * 初期セットアップ（最初の管理者作成）。
 * 管理者が1人も居ないDBに対してのみ実行できる（2人目以降はポータルの一括発行 or 管理者招待）。
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const loginId = (body.loginId ?? "").toString().trim();
  const name = (body.name ?? "").toString().trim();
  const password = (body.password ?? "").toString();

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(loginId)) {
    return NextResponse.json(
      { message: "社員番号は半角英数字とハイフン・アンダースコア（1〜64文字）で入力してください。" },
      { status: 400 }
    );
  }
  if (!name) {
    return NextResponse.json({ message: "お名前を入力してください。" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ message: "パスワードは8文字以上で設定してください。" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const admins = await countAllAdmins();
    if (admins > 0) {
      return NextResponse.json(
        { message: "既に管理者が登録されています。アカウント発行は管理者にご依頼ください。" },
        { status: 403 }
      );
    }
    if (await loginIdExists(loginId)) {
      return NextResponse.json({ message: "この社員番号は既に使われています。" }, { status: 409 });
    }
    const companyId = await getOrCreateCompanyByName("株式会社パロマ");
    await createUser(companyId, loginId, name, password, "admin");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[register]", e);
    return NextResponse.json({ message: "登録に失敗しました。" }, { status: 500 });
  }
}
