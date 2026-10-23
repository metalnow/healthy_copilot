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
