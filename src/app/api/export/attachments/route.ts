import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getSessionWithRole } from "@/lib/session";
import { searchAttachments, type AttachmentSearchRow } from "@/lib/db";
import { fetchPrivateBlob } from "@/lib/privateBlob";
import { getSql } from "@/lib/neon";
import { REQUEST_STATUS_LABEL } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 添付資料の書き出し（管理者・電帳法対応）。
 * - format=csv（既定）… 索引簿CSV。検索条件に一致する全件のメタ情報
 * - format=zip        … ファイル本体をまとめてZIPに（税務調査の「ダウンロードの求め」用）
 * 検索条件は /attachments 画面と同じ。
 */

const CSV_HEADERS = [
  "ファイル名",
  "申請No",
  "申請タイトル",
  "取引先",
  "取引年月日（自）",
  "取引年月日（至）",
  "種別",
  "サイズ(byte)",
  "登録者",
  "登録日時",
  "申請の状態",
  "削除済み",
  "削除者",
  "削除日時",
  "削除理由",
];

function cell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const line = (vs: (string | number | null | undefined)[]) => vs.map(cell).join(",") + "\r\n";

function csvRow(f: AttachmentSearchRow): string {
  return line([
    f.fileName,
    f.reqCode ?? "（下書き）",
    f.requestTitle ?? "",
    f.supplierSummary ?? "",
    f.minStartDate ?? "",
    f.maxStartDate ?? "",
    f.kind,
    f.sizeBytes,
    f.uploadedName ?? "",
    f.createdAt.slice(0, 19).replace("T", " "),
    REQUEST_STATUS_LABEL[f.requestStatus],
    f.deletedAt ? "1" : "",
    f.deletedName ?? "",
    f.deletedAt ? f.deletedAt.slice(0, 19).replace("T", " ") : "",
    f.deleteReason ?? "",
  ]);
}

/** ZIPは1回200件・合計500MBまで（メモリ保護。超える場合は条件を絞ってもらう） */
const ZIP_MAX_FILES = 200;
const ZIP_MAX_BYTES = 500 * 1024 * 1024;

export async function GET(req: Request) {
  const session = await getSessionWithRole();
  if (!session?.companyId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "添付資料の書き出しは管理者のみ利用できます" }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const str = (k: string) => sp.get(k)?.trim() || null;
  const ymd = (k: string) => {
    const v = str(k);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  const amountStr = str("amount");
  const amount = amountStr != null ? Number(amountStr.replace(/,/g, "")) : null;
  const opts = {
    q: str("q"),
    supplierQ: str("supplierQ"),
    amount: amount != null && Number.isFinite(amount) ? amount : null,
    from: ymd("from"),
    to: ymd("to"),
    includeDeleted: sp.get("deleted") === "1",
  };
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  if (sp.get("format") === "zip") {
    const { rows, total } = await searchAttachments(session.companyId, {
      ...opts,
      limit: ZIP_MAX_FILES + 1,
    });
    if (rows.length === 0) {
      return NextResponse.json({ error: "該当する添付資料がありません" }, { status: 404 });
    }
    if (total > ZIP_MAX_FILES) {
      return NextResponse.json(
        { error: `一括ダウンロードは${ZIP_MAX_FILES}件までです（該当 ${total.toLocaleString()} 件）。期間や取引先で条件を絞ってください。` },
        { status: 413 }
      );
    }
    const totalBytes = rows.reduce((n, r) => n + r.sizeBytes, 0);
    if (totalBytes > ZIP_MAX_BYTES) {
      return NextResponse.json(
        { error: "合計サイズが大きすぎます。期間や取引先で条件を絞ってください。" },
        { status: 413 }
      );
    }

    const sql = getSql();
    const zip = new JSZip();
    // 索引簿も同梱する（ZIP単体でも中身が分かるように）
    zip.file("索引簿.csv", "﻿" + line(CSV_HEADERS) + rows.map(csvRow).join(""));
    const used = new Set<string>();
    let skipped = 0;
    for (const f of rows) {
      // 本体は Blob（無ければ移行前の DB 格納分）から取得する
      const bodyRows = (await sql`
        SELECT blob_url, data FROM request_files
        WHERE company_id = ${session.companyId} AND id = ${f.id} LIMIT 1`) as {
        blob_url: string | null;
        data: Buffer | Uint8Array | null;
      }[];
      const r = bodyRows[0];
      let body: Buffer | null = null;
      if (r?.blob_url) body = await fetchPrivateBlob(r.blob_url);
      else if (r?.data != null) body = Buffer.isBuffer(r.data) ? r.data : Buffer.from(r.data);
      if (!body) {
        skipped++;
        continue;
      }
      // 同名ファイルは (2), (3)… を付けて衝突を避ける
      let name = `${f.reqCode ?? "draft"}_${f.fileName}`.replace(/[\\/:*?"<>|]/g, "_");
      for (let i = 2; used.has(name); i++) {
        const dot = name.lastIndexOf(".");
        name = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
      }
      used.add(name);
      zip.file(name, body);
    }
    if (skipped > 0) {
      zip.file("取得できなかったファイル.txt", `${skipped} 件の実体を取得できませんでした。`);
    }
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="attachments-${stamp}.zip"; filename*=UTF-8''${encodeURIComponent(`添付資料_${stamp}.zip`)}`,
        "Cache-Control": "no-store",
      },
    });
  }

  // 索引簿CSV（条件に一致する全件・1000件ずつ読みながら送り出す）
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("﻿" + line(CSV_HEADERS)));
        for (let offset = 0; ; offset += 1000) {
          const { rows } = await searchAttachments(session.companyId, {
            ...opts,
            limit: 1000,
            offset,
          });
          if (rows.length === 0) break;
          controller.enqueue(encoder.encode(rows.map(csvRow).join("")));
          if (rows.length < 1000) break;
        }
      } catch (err) {
        console.error("[export/attachments] error:", err);
        controller.enqueue(encoder.encode("\r\n# 書き出しの途中でエラーが発生しました\r\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attachments-index-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`添付資料索引簿_${stamp}.csv`)}`,
      "Cache-Control": "no-store",
    },
  });
}
