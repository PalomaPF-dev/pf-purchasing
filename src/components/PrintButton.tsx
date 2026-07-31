"use client";

import { Printer } from "lucide-react";

/** 印刷（PDF保存）ボタン。ブラウザの印刷ダイアログから「PDFに保存」で帳票PDFを出力する。 */
export default function PrintButton({ label = "印刷 / PDF保存" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4fd8]"
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
