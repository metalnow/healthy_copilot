import type { ObservationType } from "@/lib/schemas/observation";

const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });

/** 量測值的顯示文字，例如「128 / 82 mmHg」 */
export function formatObservation(
  type: ObservationType | string,
  values: Record<string, number | string>,
): string {
  const n = (key: string) => number.format(Number(values[key]));
  switch (type) {
    case "weight":
      return `${n("weight")} kg`;
    case "blood_pressure":
      return `${n("systolic")} / ${n("diastolic")} mmHg`;
    case "heart_rate":
      return `${n("bpm")} bpm`;
    case "waist":
      return `${n("waist")} cm`;
    default:
      return Object.entries(values)
        .map(([k, v]) => `${k} ${v}`)
        .join("、");
  }
}

export function formatMl(ml: number): string {
  return `${number.format(ml)} ml`;
}

/** YYYY-MM-DD → M/D */
export function formatShortDate(localDate: string): string {
  const [, m, d] = localDate.split("-").map(Number);
  return `${m}/${d}`;
}
