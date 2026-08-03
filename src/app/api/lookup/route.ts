import { NextRequest, NextResponse } from "next/server";
import { getSessionWithRole, supplierScopeOf } from "@/lib/session";
import {
  canAccessSupplier,
  currentPriceFor,
  previousPriceFor,
  searchActiveSuppliers,
  searchItems,
  searchSuggestions,
  searchSupplierItems,
  searchSuppliers,
  type SuggestScope,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 申請フォームの補助検索API。
 * - ?type=items&q=…      … 品番マスタのインクリメンタル検索
 * - ?type=suppliers&q=…  … 取引先マスタのインクリメンタル検索
 * - ?type=current&item=…&supplier=…&branch=…&loc=…&date=… … 現行単価の自動取得
 */
export async function GET(req: NextRequest) {
  const session = await getSessionWithRole();
  if (!session?.companyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");

  try {
    if (type === "items") {
      const q = (sp.get("q") ?? "").trim();
      if (!q) return NextResponse.json({ items: [] });
      const items = await searchItems(session.companyId, q);
      return NextResponse.json({ items });
    }
    // 一覧画面の検索候補（画面ごとに探す対象が違う）
    if (type === "suggest") {
      const q = (sp.get("q") ?? "").trim();
      const scope = (sp.get("scope") ?? "prices") as SuggestScope;
      if (!q) return NextResponse.json({ suggestions: [] });
      // マスタ管理の画面は管理者専用なので、その候補も管理者だけに返す
      const adminOnly: SuggestScope[] = ["items", "locations", "employees"];
      if (adminOnly.includes(scope) && session.role !== "admin") {
        return NextResponse.json({ suggestions: [] });
      }
      const scopeOf = supplierScopeOf(session);
      const suggestions = await searchSuggestions(session.companyId, scope, q, {
        buyerLoginId: scopeOf.buyerLoginId,
      });
      return NextResponse.json({ suggestions });
    }
    if (type === "suppliers") {
      const q = (sp.get("q") ?? "").trim();
      if (!q) return NextResponse.json({ suppliers: [] });
      const suppliers = await searchSuppliers(session.companyId, q);
      return NextResponse.json({ suppliers });
    }
    // 申請の起点: 取引先の選択候補（取引品目数つき。q 空でも先頭を返す）
    if (type === "supplier-picker") {
      // 一般（バイヤー）は自分の担当取引先のみ
      const scope = supplierScopeOf(session);
      const suppliers = await searchActiveSuppliers(
        session.companyId,
        (sp.get("q") ?? "").trim(),
        scope.buyerLoginId
      );
      return NextResponse.json({ suppliers });
    }
    // 取引先を選んだ後の品目候補（単価履歴ベース。品名・単位・現行単価つき）
    if (type === "supplier-items") {
      const supplier = (sp.get("supplier") ?? "").trim();
      if (!supplier) return NextResponse.json({ items: [] });
      // 担当外の取引先の品目は返さない
      const scope = supplierScopeOf(session);
      if (!(await canAccessSupplier(session.companyId, supplier, scope.buyerLoginId))) {
        return NextResponse.json({ items: [] });
      }
      const items = await searchSupplierItems(
        session.companyId,
        supplier,
        (sp.get("q") ?? "").trim()
      );
      return NextResponse.json({ items });
    }
    if (type === "current") {
      const item = (sp.get("item") ?? "").trim();
      const supplier = (sp.get("supplier") ?? "").trim();
      if (!item || !supplier) return NextResponse.json({ current: null });
      const scope = supplierScopeOf(session);
      if (!(await canAccessSupplier(session.companyId, supplier, scope.buyerLoginId))) {
        return NextResponse.json({ current: null });
      }
      // 旧単価は「適用日の前日時点で有効な単価」。日付未指定なら現在有効な単価
      const date = sp.get("date");
      const current = date
        ? await previousPriceFor(session.companyId, item, supplier, {
            branch: sp.get("branch") || null,
            locCd: sp.get("loc") || null,
            startDate: date,
          })
        : await currentPriceFor(session.companyId, item, supplier, {
            branch: sp.get("branch") || null,
            locCd: sp.get("loc") || null,
            onDate: null,
          });
      return NextResponse.json({ current });
    }
    return NextResponse.json({ error: "unknown type" }, { status: 400 });
  } catch (e) {
    console.error("[lookup]", e);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
}
