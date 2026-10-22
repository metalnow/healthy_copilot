import type { MedicationLabel } from "@/lib/ai/schemas";
import type { MEDICATION_CATEGORIES, MEDICATION_TIMINGS } from "@/lib/enums";

export type MedicationDraft = {
  name?: string;
  category?: (typeof MEDICATION_CATEGORIES)[number];
  dose?: number;
  unit?: string;
  timing?: (typeof MEDICATION_TIMINGS)[number];
  times: string[];
};

/** 每日次數 → 預設服用時間；使用者可在表單上調整 */
const TIMES_BY_COUNT: Record<number, string[]> = {
  1: ["08:00"],
  2: ["08:00", "20:00"],
  3: ["08:00", "13:00", "19:00"],
  4: ["08:00", "12:00", "17:00", "21:00"],
};

/** AI 讀到的標籤內容 → 新增藥物表單的預填值（不合理的數值直接略過） */
export function medicationDraftFromLabel(label: MedicationLabel): MedicationDraft {
  const count = label.timesPerDay !== null ? Math.round(label.timesPerDay) : null;
  const times =
    label.timing === "bedtime" && (count === null || count === 1)
      ? ["21:30"]
      : count !== null
        ? (TIMES_BY_COUNT[count] ?? [])
        : [];
  return {
    name: label.name?.trim().slice(0, 100) || undefined,
    category: label.category ?? undefined,
    dose: label.dosePerIntake !== null && label.dosePerIntake > 0 ? label.dosePerIntake : undefined,
    unit: label.unit?.trim().slice(0, 20) || undefined,
    timing: label.timing ?? undefined,
    times,
  };
}
