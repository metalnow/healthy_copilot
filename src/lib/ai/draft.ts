import { z } from "zod";
import { DRINK_TYPES, MEAL_TYPES, type MealType } from "@/lib/enums";
import { NutritionEstimateSchema, type NutritionEstimate } from "@/lib/schemas/common";
import { OBSERVATION_TYPES, OBSERVATION_VALUE_SCHEMAS } from "@/lib/schemas/observation";
import { fromDateTimeLocalValue, toDateTimeLocalValue, toLocalDate } from "@/lib/time";
import type { AiEvent, AiFoodItem, FoodPhotoResult, TextParseResult } from "./schemas";

// 「AI 結果 → 可編輯草稿 → 使用者確認」：草稿是使用者實際送出的資料，伺服器再以此 schema 驗證。

const DateTimeLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "時間格式不正確");
const Confidence = z.number().min(0).max(1);

export const DraftFoodItemSchema = z.object({
  name: z.string().trim().min(1, "請輸入品名").max(100, "品名最多 100 字"),
  portion: z.string().trim().max(50, "份量最多 50 字").optional(),
  /** 使用者修改品名或份量後，前端會移除估算值 */
  nutrition: NutritionEstimateSchema.optional(),
  confidence: Confidence.optional(),
});
export type DraftFoodItem = z.infer<typeof DraftFoodItemSchema>;

const optionalAmount = z.number().nonnegative().max(10000).optional();

export const DraftEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("food"),
    mealType: z.enum(MEAL_TYPES),
    occurredAt: DateTimeLocal,
    items: z.array(DraftFoodItemSchema).min(1, "請至少保留一項食物").max(30),
    confidence: Confidence.optional(),
  }),
  z.object({
    kind: z.literal("drink"),
    drinkType: z.enum(DRINK_TYPES),
    name: z.string().trim().max(100).optional(),
    volumeMl: z.number().min(1, "請輸入容量").max(5000),
    caffeineMg: optionalAmount,
    sugarG: optionalAmount,
    alcoholG: optionalAmount,
    kcal: optionalAmount,
    occurredAt: DateTimeLocal,
    confidence: Confidence.optional(),
  }),
  z.object({
    kind: z.literal("measurement"),
    measurementType: z.enum(OBSERVATION_TYPES),
    values: z.record(z.string(), z.number()),
    occurredAt: DateTimeLocal,
    confidence: Confidence.optional(),
  }),
]);
export type DraftEvent = z.infer<typeof DraftEventSchema>;

export const ConfirmDraftSchema = z.object({
  extractionId: z.string().min(1),
  events: z.array(DraftEventSchema).min(1, "沒有要儲存的項目").max(20),
});
export type ConfirmDraft = z.infer<typeof ConfirmDraftSchema>;

/** 量測值的範圍檢查沿用手動輸入的規則 */
export function validateMeasurementValues(event: Extract<DraftEvent, { kind: "measurement" }>) {
  return OBSERVATION_VALUE_SCHEMAS[event.measurementType].safeParse(event.values);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function toNutrition(item: AiFoodItem): NutritionEstimate | undefined {
  const entries = Object.entries(item.nutrition).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] >= 0,
  );
  if (entries.length === 0) return undefined;
  return { estimated: true, ...Object.fromEntries(entries) };
}

function toDraftItems(items: AiFoodItem[]): DraftFoodItem[] {
  return items
    .filter((item) => item.name.trim() !== "")
    .map((item) => ({
      name: item.name.trim().slice(0, 100),
      portion: item.portion?.trim().slice(0, 50) || undefined,
      nutrition: toNutrition(item),
      confidence: clamp01(item.confidence),
    }));
}

/** 加總品項營養；全部都沒有估算值時回傳 undefined */
export function sumNutrition(items: { nutrition?: NutritionEstimate }[]): NutritionEstimate | undefined {
  const withNutrition = items.filter((i) => i.nutrition);
  if (withNutrition.length === 0) return undefined;
  const total: NutritionEstimate = { estimated: true };
  for (const { nutrition } of withNutrition) {
    for (const [key, value] of Object.entries(nutrition!)) {
      if (key === "estimated" || typeof value !== "number") continue;
      const k = key as Exclude<keyof NutritionEstimate, "estimated">;
      total[k] = Math.round(((total[k] ?? 0) + value) * 10) / 10;
    }
  }
  return total;
}

export function guessMealType(localTime: string): MealType {
  if (localTime < "10:30") return "breakfast";
  if (localTime < "14:30") return "lunch";
  if (localTime >= "17:00" && localTime < "21:00") return "dinner";
  return "snack";
}

const DEFAULT_MEAL_TIME: Record<MealType, string> = {
  breakfast: "08:00",
  lunch: "12:30",
  dinner: "18:30",
  snack: "15:00",
  other: "12:00",
};

function addDays(localDate: string, days: number) {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** AI 給的相對日期與時刻 → datetime-local；不得晚於現在 */
export function resolveOccurredAt(
  event: { dayOffset: number; localTime: string | null; mealType?: MealType | null },
  now: Date,
  timeZone: string,
): string {
  const nowLocal = toDateTimeLocalValue(now, timeZone);
  const dayOffset = Math.max(-7, Math.min(0, Math.round(event.dayOffset)));
  const date = addDays(toLocalDate(now, timeZone), dayOffset);
  const time =
    event.localTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(event.localTime)
      ? event.localTime
      : dayOffset === 0
        ? nowLocal.slice(11)
        : DEFAULT_MEAL_TIME[event.mealType ?? "other"];
  const value = `${date}T${time}`;
  return fromDateTimeLocalValue(value, timeZone) > now ? nowLocal : value;
}

function measurementValues(event: AiEvent): Record<string, number> | null {
  switch (event.measurementType) {
    case "weight":
      return event.weightKg != null ? { weight: event.weightKg } : null;
    case "blood_pressure":
      if (event.systolic == null || event.diastolic == null) return null;
      return {
        systolic: Math.round(event.systolic),
        diastolic: Math.round(event.diastolic),
        ...(event.pulse != null && { pulse: Math.round(event.pulse) }),
      };
    case "heart_rate":
      return event.bpm != null ? { bpm: Math.round(event.bpm) } : null;
    case "waist":
      return event.waistCm != null ? { waist: event.waistCm } : null;
    default:
      return null;
  }
}

const DEFAULT_DRINK_VOLUME_ML = 250;
const nonNegative = (n: number | null) => (n != null && n >= 0 ? n : undefined);

export function draftFromTextParse(result: TextParseResult, now: Date, timeZone: string): DraftEvent[] {
  const drafts: DraftEvent[] = [];
  for (const event of result.events) {
    const confidence = clamp01(event.confidence);
    if (event.kind === "food") {
      const items = toDraftItems(event.items);
      if (items.length === 0) continue;
      const occurredAt = resolveOccurredAt(event, now, timeZone);
      drafts.push({
        kind: "food",
        mealType: event.mealType ?? guessMealType(occurredAt.slice(11)),
        occurredAt,
        items,
        confidence,
      });
    } else if (event.kind === "drink") {
      const volumeKnown = event.volumeMl != null && event.volumeMl > 0;
      drafts.push({
        kind: "drink",
        drinkType: event.drinkType ?? "other",
        name: event.drinkName?.trim().slice(0, 100) || undefined,
        volumeMl: volumeKnown ? Math.round(event.volumeMl!) : DEFAULT_DRINK_VOLUME_ML,
        caffeineMg: nonNegative(event.caffeineMg),
        sugarG: nonNegative(event.sugarG),
        alcoholG: nonNegative(event.alcoholG),
        kcal: nonNegative(event.drinkKcal),
        occurredAt: resolveOccurredAt(event, now, timeZone),
        confidence: volumeKnown ? confidence : Math.min(confidence, 0.5),
      });
    } else if (event.kind === "measurement" && event.measurementType) {
      const values = measurementValues(event);
      if (!values) continue;
      drafts.push({
        kind: "measurement",
        measurementType: event.measurementType,
        values,
        occurredAt: resolveOccurredAt(event, now, timeZone),
        confidence,
      });
    }
  }
  return drafts;
}

export function draftFromFoodPhoto(result: FoodPhotoResult, now: Date, timeZone: string): DraftEvent[] {
  const items = toDraftItems(result.items);
  if (!result.isFood || items.length === 0) return [];
  const occurredAt = toDateTimeLocalValue(now, timeZone);
  return [
    {
      kind: "food",
      mealType: result.mealType ?? guessMealType(occurredAt.slice(11)),
      occurredAt,
      items,
      confidence: clamp01(result.overallConfidence),
    },
  ];
}

/** 低於此信心值的項目在確認畫面特別標示 */
export const LOW_CONFIDENCE = 0.6;

export function occurredAtInstant(event: DraftEvent, timeZone: string) {
  return fromDateTimeLocalValue(event.occurredAt, timeZone);
}
