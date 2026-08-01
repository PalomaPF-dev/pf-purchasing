import { toCsvRaw } from "./csv";
import { toYmd8 } from "./format";
import type { ExportableLine } from "./db";

/**
 * mcframe 取込CSV（購買単価）生成。
 * 「MC取込フォーマット.xlsx」と同一の列構成：
 *   1行目 = 項目キー、2行目 = 日本語ラベル、3行目以降 = データ。
 */

// 1行目（項目キー）— MC取込フォーマット.xlsx の1行目そのまま
export const MC_HEADER_KEYS = [
  "del_flg", "wg_cd", "wg_nm", "itm_p.itm_cd", "itm_p.itm_sub1", "itm_p.itm_nm",
  "itm_typ", "itm_typ_nm", "itm_typ_d_cd", "itm_typ_d_nm",
  "sppl_cd", "sppl_nm", "単位ＣＤ", "unit_nm", "qty_p.qty", "通貨ＣＤ", "cur_nm",
  "納入場所CD", "loc_nm", "dlv_cd", "dlv_nm", "dt_p.st_dt", "dt_p.end_dt",
  "outsrc_upri_typ", "outsrc_upri_typ_nm", "purc_tax_cd", "purc_tax_nm",
  "upri1_p.upri", "upri2_p.upri", "interim_flg", "std_wk_cost", "not_cost_flg",
  "upri3_p.upri", "upri4_p.upri", "upri5_p.upri", "memo1", "memo2", "memo3",
  "ins_usr_id", "ins_usr_nm", "ins_ts", "ins_func_id", "ins_func_nm",
  "upd_usr_id", "upd_usr_nm", "upd_ts", "upd_func_id", "upd_func_nm",
  "upd_srv_req_no", "del_usr_id", "del_usr_nm", "del_ts",
];

// 2行目（日本語ラベル）— MC取込フォーマット.xlsx の2行目そのまま
export const MC_HEADER_LABELS = [
  "論理削除", "ワーキンググループＣＤ", "ワーキンググループ名", "品目ＣＤ", "枝番１", "品名",
  "品目区分", "品目区分名", "品目区分詳細ＣＤ", "品目区分詳細名",
  "発注先ＣＤ", "発注先名", "単位ＣＤ", "単位名", "ロット数", "通貨ＣＤ", "通貨名",
  "納入場所CD", "納入場所名", "納品先ＣＤ", "納品先名", "適用開始日", "適用終了日",
  "外注単価区分", "外注単価区分名", "仕入税ＣＤ", "仕入税名",
  "単価", "改訂前単価", "仮単価", "標準工数", "原価対象外",
  "予備単価１", "予備単価２", "予備単価３", "メモ１", "メモ２", "メモ３",
  "登録ユーザＩＤ", "登録ユーザ名", "登録日時", "登録機能ＩＤ", "登録機能名",
  "更新ユーザＩＤ", "更新ユーザ名", "更新日時", "更新機能ＩＤ", "更新機能名",
  "更新リクエストＮＯ", "論理削除ユーザＩＤ", "論理削除ユーザ名", "論理削除日時",
];

/**
 * 承認済み明細1件 → MC取込1行（52列）。
 *
 * 単価改訂では「既存レコードの項目は維持し、単価と適用日だけを更新する」のが原則。
 * そのため、単位ＣＤ・ロット数・通貨・納入場所・納品先・ワーキンググループ・仕入税ＣＤ・
 * メモは、同一キーの直前の単価履歴（＝mcframe の現行登録値）を優先して出力する。
 * 申請で明示的に入力された値がある場合のみ、そちらで上書きする。
 * 更新されるのは 適用開始日 / 適用終了日 / 単価 / 改訂前単価 の4項目。
 */
export function lineToMcRow(l: ExportableLine): (string | number)[] {
  const b = l.base;
  /** 申請で入力があればそれを、無ければ既存値を採用する */
  const keep = (input: string | null, base: string | null | undefined): string =>
    (input ?? "").trim() !== "" ? (input as string) : (base ?? "");
  const keepNum = (input: number | null, base: number | null | undefined): number | string =>
    input != null ? input : base != null ? base : 0;

  const currency = keep(l.currency === "JPY" ? null : l.currency, b?.currency === "JPY" ? null : b?.currency);

  return [
    "0", // del_flg
    keep(l.wgCd, b?.wgCd) || "WG00", // wg_cd
    "", // wg_nm（マスタ参照のため空欄）
    l.itemCd, // itm_p.itm_cd
    keep(l.itemBranch, b?.itemBranch), // itm_p.itm_sub1
    keep(l.itemName, b?.itemName), // itm_p.itm_nm
    "", "", "", "", // itm_typ / itm_typ_nm / itm_typ_d_cd / itm_typ_d_nm（既存値を維持＝空欄）
    l.supplierCd, // sppl_cd
    keep(l.supplierName, b?.supplierName), // sppl_nm
    keep(l.unitCd, b?.unitCd), // 単位ＣＤ
    "", // unit_nm（マスタ参照のため空欄）
    keepNum(l.lotQty, b?.lotQty), // qty_p.qty（ロット数）
    currency, // 通貨ＣＤ（JPYは既定のため空欄）
    "", // cur_nm
    keep(l.locCd, b?.locCd), // 納入場所CD
    l.locName ?? "", // loc_nm
    keep(l.dlvCd, b?.dlvCd), // dlv_cd
    l.dlvName ?? "", // dlv_nm
    toYmd8(l.startDate), // dt_p.st_dt ★更新
    toYmd8(l.endDate) || "20991231", // dt_p.end_dt ★更新
    "", "", // outsrc_upri_typ / _nm
    keep(l.taxCd, b?.taxCd) || "P0010", // purc_tax_cd
    "", // purc_tax_nm
    l.newPrice, // upri1_p.upri（単価）★更新
    l.currentPrice ?? "", // upri2_p.upri（改訂前単価）★更新
    "0", // interim_flg（仮単価）
    "", // std_wk_cost
    "0", // not_cost_flg
    "", "", "", // upri3-5
    b?.memo1 ?? "", b?.memo2 ?? "", b?.memo3 ?? "", // memo1-3（既存値を維持）
    "", "", "", "", "", // ins_*
    "", "", "", "", "", // upd_*
    "", "", "", "", // upd_srv_req_no / del_*
  ];
}

/** 承認済み明細一覧 → MC取込CSV（UTF-8 BOM・CRLF） */
export function toMcCsv(lines: ExportableLine[]): string {
  return toCsvRaw([MC_HEADER_KEYS, MC_HEADER_LABELS, ...lines.map(lineToMcRow)]);
}
