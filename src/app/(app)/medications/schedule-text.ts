import { WEEKDAY_LABELS } from "@/lib/labels";

export function daysText(daysOfWeek: number[] | null) {
  if (!daysOfWeek || daysOfWeek.length === 0 || daysOfWeek.length === 7) return "每天";
  return `每週${daysOfWeek.map((d) => WEEKDAY_LABELS[d]).join("、")}`;
}

export function doseText(dose: number | null, unit: string | null) {
  if (dose === null) return unit ?? "";
  return `${dose}${unit ? ` ${unit}` : ""}`;
}
