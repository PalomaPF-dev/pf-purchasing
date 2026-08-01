import { NextRequest, NextResponse } from "next/server";
import { getSessionWithRole, supplierScopeOf } from "@/lib/session";
import {
  canAccessSupplier,
  currentPriceFor,
  searchActiveSuppliers,
  searchItems,
  searchSupplierItems,
  searchSuppliers,
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
      const current = await currentPriceFor(session.companyId, item, supplier, {
        branch: sp.get("branch") || null,
        locCd: sp.get("loc") || null,
        onDate: sp.get("date") || null,
      });
      return NextResponse.json({ current });
    }
    return NextResponse.json({ error: "unknown type" }, { status: 400 });
  } catch (e) {
    console.error("[lookup]", e);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
}
