"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { setSupplierContactsAction } from "@/lib/actions";

export interface ContactValue {
  loginId: string | null;
  name: string | null;
}

/** 社員番号と氏名を「谷口 慶治（014272）」の形で表示する。氏名が未登録なら社員番号のみ。 */
export function ContactLabel({ loginId, name }: ContactValue) {
  if (!loginId) return <span className="text-[#a0a0a0]">—</span>;
  return (
    <span>
      {name ? <span>{name}</span> : null}
      <span className={`font-mono text-xs ${name ? "ml-1 text-[#909090]" : ""}`}>
        {name ? `（${loginId}）` : loginId}
      </span>
    </span>
  );
}

/**
 * 取引先1件の担当窓口の割当。
 * - 企画G（バイヤー）: 主担当・副担当
 * - 管理G（チェイサー）
 * ここに設定された社員だけが、その取引先を閲覧・申請できる（管理者は全件）。
 */
export default function ContactsAssign({
  supplierId,
  supplierLabel,
  group,
  buyer,
  buyerSub,
  chaser,
}: {
  supplierId: string;
  supplierLabel: string;
  /** 編集対象のグループ。列ごとに1つずつ表示する */
  group: "planning" | "management";
  buyer: ContactValue;
  buyerSub: ContactValue;
  chaser: ContactValue;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [buyerId, setBuyerId] = useState(buyer.loginId ?? "");
  const [subId, setSubId] = useState(buyerSub.loginId ?? "");
  const [chaserId, setChaserId] = useState(chaser.loginId ?? "");
  const [busy, setBusy] = useState(false);

  function save() {
    setBusy(true);
    setSupplierContactsAction(supplierId, {
      buyerLoginId: buyerId,
      buyerSubLoginId: subId,
      chaserLoginId: chaserId,
    })
      .then(() => {
        setEditing(false);
        router.refresh();
      })
      .catch((e) => alert(e instanceof Error ? e.message : "更新に失敗しました"))
      .finally(() => setBusy(false));
  }

  function cancel() {
    setBuyerId(buyer.loginId ?? "");
    setSubId(buyerSub.loginId ?? "");
    setChaserId(chaser.loginId ?? "");
    setEditing(false);
  }

  const planning = group === "planning";

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={`${supplierLabel} の${planning ? "企画G" : "管理G"}担当を変更`}
        className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-sm hover:bg-[#f7f7f5]"
      >
        <span>
          {planning ? (
            <>
              <ContactLabel {...buyer} />
              {buyerSub.loginId && (
                <span className="block text-xs text-[#707070]">
                  副: <ContactLabel {...buyerSub} />
                </span>
              )}
            </>
          ) : (
            <ContactLabel {...chaser} />
          )}
        </span>
        <Pencil className="h-3 w-3 shrink-0 text-[#c0c0c0]" />
      </button>
    );
  }

  const cell =
    "w-24 rounded border border-[#d5d5d5] px-1.5 py-1 font-mono text-xs focus:border-[#e11d48] focus:outline-none";
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  };

  return (
    <div className="flex flex-col gap-1">
      {planning ? (
        <>
          <label className="flex items-center gap-1 text-[10px] text-[#707070]">
            主
            <input autoFocus value={buyerId} onChange={(e) => setBuyerId(e.target.value)} onKeyDown={onKey} placeholder="社員番号" className={cell} />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-[#707070]">
            副
            <input value={subId} onChange={(e) => setSubId(e.target.value)} onKeyDown={onKey} placeholder="社員番号" className={cell} />
          </label>
        </>
      ) : (
        <input autoFocus value={chaserId} onChange={(e) => setChaserId(e.target.value)} onKeyDown={onKey} placeholder="社員番号" className={cell} />
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded p-1 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
          title="保存"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button type="button" onClick={cancel} className="rounded p-1 text-[#707070] hover:bg-[#f7f7f5]" title="キャンセル">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
