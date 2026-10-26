import { z } from "zod";
import { ABNORMAL_FLAGS } from "@/lib/enums";
import type { LabExtraction } from "@/lib/ai/schemas";
import { FollowUpDraftSchema } from "@/lib/follow-ups";
import {
  canonicalLabName,
  defaultFlag,
  flagFromReference,
  getLabDefinition,
  inferLabCode,
  LAB_CODES,
  toCanonicalUnit,
} from "./catalog";

const optionalNumber = z.number().finite().optional();

export const LabDraftItemSchema = z
  .object({
    code: z.enum(LAB_CODES),
    displayName: z.string().trim().min(1, "請輸入項目名稱").max(100),
    value: optionalNumber,
    textValue: z.string().trim().max(500).optional(),
    unit: z.string().trim().max(30).optional(),
    referenceMin: optionalNumber,
    referenceMax: optionalNumber,
    referenceText: z.string().trim().max(100).optional(),
    abnormalFlag: z.enum(ABNORMAL_FLAGS).optional(),
    page: z.number().int().positive().optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine((item) => item.value !== undefined || (item.textValue ?? "") !== "", {
    message: "每個項目都需要數值或文字結果",
  });
export type LabDraftItem = z.infer<typeof LabDraftItemSchema>;

export const ConfirmLabsSchema = z.object({
  documentId: z.string().min(1),
  reportDate: z.iso.date("請輸入檢查日期"),
  institution: z.string().trim().max(100).optional(),
  items: z.array(LabDraftItemSchema).min(1, "沒有要儲存的項目").max(300),
  followUps: z.array(FollowUpDraftSchema).max(50).default([]),
});
export type ConfirmLabs = z.infer<typeof ConfirmLabsSchema>;

const opt = <T>(v: T | null | undefined) => (v === null ? undefined : v);

export function labDraftFromExtraction(extraction: LabExtraction): {
  reportDate?: string;
  institution?: string;
  items: LabDraftItem[];
} {
  const codes = new Set<string>(LAB_CODES);
  const items = extraction.items
    .filter((i) => i.displayName.trim() !== "" && (i.value !== null || (i.textValue ?? "").trim() !== ""))
    .map((i) => ({
      code: inferLabCode(codes.has(i.code) ? i.code : "OTHER", i.displayName) as LabDraftItem["code"],
      displayName: i.displayName.trim().slice(0, 100),
      value: opt(i.value),
      textValue: opt(i.textValue)?.trim().slice(0, 500) || undefined,
      unit: opt(i.unit)?.trim().slice(0, 30) || undefined,
      referenceMin: opt(i.referenceMin),
      referenceMax: opt(i.referenceMax),
      referenceText: opt(i.referenceText)?.trim().slice(0, 100) || undefined,
      abnormalFlag: opt(i.abnormalFlag),
      page: i.page && i.page > 0 ? Math.round(i.page) : undefined,
      confidence: Math.min(1, Math.max(0, i.confidence)),
    }));
  const reportDate =
    extraction.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(extraction.reportDate) ? extraction.reportDate : undefined;
  return { reportDate, institution: opt(extraction.institution)?.slice(0, 100), items };
}

export type LabObservationValues = {
  code: string;
  displayName: string;
  value: number | null;
  textValue: string | null;
  unit: string | null;
  referenceMin: number | null;
  referenceMax: number | null;
  referenceText: string | null;
  abnormalFlag: (typeof ABNORMAL_FLAGS)[number];
  sourcePage: number | null;
  confidence: number | null;
};

/** 確認後的項目 → 寫入資料庫的值：數值與參考範圍一起換算成標準單位，未標示的異常依參考範圍判斷 */
export function toLabObservationValues(item: LabDraftItem): LabObservationValues {
  const convert = (v: number | undefined) =>
    v === undefined ? null : toCanonicalUnit(item.code, v, item.unit).value;
  const value = convert(item.value);
  const unit =
    item.value !== undefined
      ? toCanonicalUnit(item.code, item.value, item.unit).unit
      : (item.unit ?? getLabDefinition(item.code)?.unit ?? null);
  const referenceMin = convert(item.referenceMin);
  const referenceMax = convert(item.referenceMax);

  return {
    code: item.code,
    displayName: canonicalLabName(item.code, item.displayName),
    value,
    textValue: item.textValue ?? null,
    unit,
    referenceMin,
    referenceMax,
    referenceText: item.referenceText ?? null,
    abnormalFlag:
      item.abnormalFlag ??
      (referenceMin === null && referenceMax === null ? defaultFlag(item.code, value, item.textValue ?? null) : null) ??
      flagFromReference(value, referenceMin, referenceMax),
    sourcePage: item.page ?? null,
    confidence: item.confidence ?? null,
  };
}
