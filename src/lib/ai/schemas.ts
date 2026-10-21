import { z } from "zod";
import { DRINK_TYPES, MEAL_TYPES } from "@/lib/enums";
import { OBSERVATION_TYPES } from "@/lib/schemas/observation";

// AI 輸出用的 schema：所有欄位必填、無值用 null、不加數值範圍限制，
// 讓各供應商的 strict structured output 都能接受。數值合理性在使用者確認後由領域 schema 驗證。

const num = z.number().nullable();

export const AiNutritionSchema = z
  .strictObject({
    kcal: num,
    proteinG: num,
    fatG: num,
    carbG: num,
    fiberG: num,
    sugarG: num,
    sodiumMg: num,
  })
  .describe("營養素估算值（整份）；無法估計的欄位填 null");

export const AiFoodItemSchema = z.strictObject({
  name: z.string().describe("食物名稱，繁體中文"),
  portion: z.string().nullable().describe("份量描述，例如「1 碗」「2 塊」「約 200 g」"),
  quantity: num.describe("數量，無法判斷填 null"),
  cookingMethod: z.string().nullable().describe("烹調方式，例如 炸、炒、蒸、烤"),
  hasSauce: z.boolean().nullable(),
  confidence: z.number().describe("對此品項辨識的信心 0–1"),
  nutrition: AiNutritionSchema,
});
export type AiFoodItem = z.infer<typeof AiFoodItemSchema>;

export const FoodPhotoResultSchema = z.strictObject({
  isFood: z.boolean().describe("照片中是否有食物或飲料"),
  mealType: z.enum(MEAL_TYPES).nullable().describe("依內容推測的餐別，無法判斷填 null"),
  items: z.array(AiFoodItemSchema),
  overallConfidence: z.number().describe("整體信心 0–1"),
  notes: z.string().nullable().describe("給使用者的簡短補充，例如看不清楚的部分"),
});
export type FoodPhotoResult = z.infer<typeof FoodPhotoResultSchema>;

export const AI_EVENT_KINDS = ["food", "drink", "measurement"] as const;

/** 扁平結構：依 kind 使用對應欄位，其餘填 null（比 union 更容易被各模型正確輸出） */
export const AiEventSchema = z.strictObject({
  kind: z.enum(AI_EVENT_KINDS),
  dayOffset: z.number().describe("相對今天的天數：今天 0、昨天 -1"),
  localTime: z.string().nullable().describe("當地時間 HH:mm（24 小時制）；未提及填 null"),
  confidence: z.number().describe("對此事件解析的信心 0–1"),

  mealType: z.enum(MEAL_TYPES).nullable().describe("kind=food 時的餐別"),
  items: z.array(AiFoodItemSchema).describe("kind=food 時的品項；其他 kind 填空陣列"),

  drinkType: z.enum(DRINK_TYPES).nullable().describe("kind=drink 時的類型"),
  drinkName: z.string().nullable().describe("kind=drink 時的名稱，例如 無糖拿鐵"),
  volumeMl: num.describe("kind=drink 時的容量 ml"),
  caffeineMg: num.describe("kind=drink 時估計的咖啡因 mg"),
  sugarG: num.describe("kind=drink 時估計的糖 g"),
  alcoholG: num.describe("kind=drink 時估計的酒精 g"),
  drinkKcal: num.describe("kind=drink 時估計的熱量 kcal"),

  measurementType: z.enum(OBSERVATION_TYPES).nullable().describe("kind=measurement 時的量測類型"),
  weightKg: num,
  systolic: num,
  diastolic: num,
  pulse: num,
  bpm: num,
  waistCm: num,
});
export type AiEvent = z.infer<typeof AiEventSchema>;

export const TextParseResultSchema = z.strictObject({
  events: z.array(AiEventSchema),
  unparsed: z.string().nullable().describe("無法歸類為飲食、飲料或量測的內容，原文保留；沒有則填 null"),
});
export type TextParseResult = z.infer<typeof TextParseResultSchema>;

/** 送給 OpenRouter 的 JSON Schema（去掉 $schema 欄位） */
export function toResponseSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
