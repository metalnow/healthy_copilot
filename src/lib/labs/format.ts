import type { ABNORMAL_FLAGS } from "@/lib/enums";
import { rastClass } from "./catalog";

export const FLAG_LABELS: Record<(typeof ABNORMAL_FLAGS)[number], string> = {
  high: "偏高",
  low: "偏低",
  critical: "危急值",
  normal: "正常",
  unknown: "",
};

export const FLAG_CLASSES: Record<(typeof ABNORMAL_FLAGS)[number], string> = {
  high: "text-warning",
  low: "text-warning",
  critical: "font-semibold text-red-600",
  normal: "text-muted",
  unknown: "text-muted",
};

type Flag = (typeof ABNORMAL_FLAGS)[number];

/** 異常標示：文字結果（超音波描述等）沒有高低之分，偏高 / 偏低改顯示「異常」 */
export function labFlag(row: { value: number | null; abnormalFlag: Flag | null }) {
  const flag = row.abnormalFlag ?? "unknown";
  const label = row.value === null && (flag === "high" || flag === "low") ? "異常" : FLAG_LABELS[flag];
  return { label, className: FLAG_CLASSES[flag] };
}

/** 文字結果較長時（超音波描述等）不適合擠在右側欄位 */
export function isLongLabText(row: { value: number | null; textValue: string | null }) {
  return row.value === null && (row.textValue?.length ?? 0) > 10;
}

const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 });

export function formatLabValue(row: { code?: string; value: number | null; textValue: string | null; unit: string | null }) {
  if (row.value !== null) {
    const text = `${number.format(row.value)}${row.unit ? ` ${row.unit}` : ""}`;
    if (row.code !== "IGE_SPECIFIC") return text;
    const { level, label } = rastClass(row.value);
    return `${text}（第 ${level} 級 ${label}）`;
  }
  return row.textValue ?? "—";
}

export function formatReference(row: {
  referenceMin: number | null;
  referenceMax: number | null;
  referenceText: string | null;
}) {
  if (row.referenceMin !== null && row.referenceMax !== null) {
    return `${number.format(row.referenceMin)}–${number.format(row.referenceMax)}`;
  }
  if (row.referenceMax !== null) return `< ${number.format(row.referenceMax)}`;
  if (row.referenceMin !== null) return `> ${number.format(row.referenceMin)}`;
  return row.referenceText ?? "";
}
