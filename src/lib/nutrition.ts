// 每日營養攝取：把飲食與飲料的營養估算加總（純函式）。

import type { NutritionEstimate } from "@/lib/schemas/common";

export const NUTRIENTS = [
  { key: "kcal", label: "熱量", unit: "kcal", digits: 0 },
  { key: "proteinG", label: "蛋白質", unit: "g", digits: 1 },
  { key: "fatG", label: "脂肪", unit: "g", digits: 1 },
  { key: "carbG", label: "碳水化合物", unit: "g", digits: 1 },
  { key: "fiberG", label: "膳食纖維", unit: "g", digits: 1 },
  { key: "sugarG", label: "糖", unit: "g", digits: 1 },
  { key: "sodiumMg", label: "鈉", unit: "mg", digits: 0 },
  { key: "caffeineMg", label: "咖啡因", unit: "mg", digits: 0 },
  { key: "alcoholG", label: "酒精", unit: "g", digits: 1 },
] as const;
export type NutrientKey = (typeof NUTRIENTS)[number]["key"];
export type NutrientValues = Partial<Record<NutrientKey, number>>;

export type IntakeRow = {
  id: string;
  kind: "food" | "drink";
  occurredAt: string;
  values: NutrientValues;
  /** 含 AI 估算值 */
  estimated: boolean;
};

function fromNutrition(n: NutritionEstimate | null | undefined): NutrientValues {
  const values: NutrientValues = {};
  for (const { key } of NUTRIENTS) {
    const v = n?.[key];
    if (typeof v === "number" && v >= 0) values[key] = v;
  }
  return values;
}

export function foodIntake(f: { id: string; occurredAt: string; totalNutrition: NutritionEstimate | null }): IntakeRow {
  return {
    id: f.id,
    kind: "food",
    occurredAt: f.occurredAt,
    values: fromNutrition(f.totalNutrition),
    estimated: f.totalNutrition?.estimated ?? false,
  };
}

/** 飲料：營養估算加上單獨存放的糖、咖啡因、酒精欄位；水沒有熱量 */
export function drinkIntake(d: {
  id: string;
  occurredAt: string;
  drinkType: string;
  nutrition: NutritionEstimate | null;
  sugarG: number | null;
  caffeineMg: number | null;
  alcoholG: number | null;
}): IntakeRow {
  const values = fromNutrition(d.nutrition);
  if (d.drinkType === "water") values.kcal = 0;
  if (d.sugarG !== null && values.sugarG === undefined) values.sugarG = d.sugarG;
  if (d.caffeineMg !== null) values.caffeineMg = d.caffeineMg;
  if (d.alcoholG !== null) values.alcoholG = d.alcoholG;
  return {
    id: d.id,
    kind: "drink",
    occurredAt: d.occurredAt,
    values,
    estimated: d.nutrition?.estimated ?? (d.sugarG !== null || d.caffeineMg !== null),
  };
}

/** 加總；只有某些紀錄有的營養素也照加，並回傳缺少熱量的筆數 */
export function sumIntake(rows: IntakeRow[]) {
  const totals: NutrientValues = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.values) as [NutrientKey, number][]) {
      totals[key] = Math.round(((totals[key] ?? 0) + value) * 10) / 10;
    }
  }
  return {
    totals,
    estimated: rows.some((r) => r.estimated),
    missingKcal: rows.filter((r) => r.values.kcal === undefined).length,
  };
}

/** 三大營養素佔熱量的比例（蛋白質、碳水 4 kcal/g，脂肪 9 kcal/g）；缺任一項就不算，避免誤導 */
export function macroShares(totals: NutrientValues) {
  if (totals.proteinG === undefined || totals.fatG === undefined || totals.carbG === undefined) return null;
  const p = totals.proteinG * 4;
  const f = totals.fatG * 9;
  const c = totals.carbG * 4;
  const sum = p + f + c;
  if (sum === 0) return null;
  return { protein: Math.round((p / sum) * 100), fat: Math.round((f / sum) * 100), carb: Math.round((c / sum) * 100) };
}

export function formatNutrient(key: NutrientKey, value: number | undefined) {
  if (value === undefined) return "—";
  const def = NUTRIENTS.find((n) => n.key === key)!;
  return value.toLocaleString("zh-TW", { maximumFractionDigits: def.digits });
}
