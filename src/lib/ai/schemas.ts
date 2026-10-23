import { z } from "zod";
import {
  DRINK_TYPES,
  EXERCISE_TYPES,
  INTENSITIES,
  MEAL_TYPES,
  MEDICATION_CATEGORIES,
  MEDICATION_TIMINGS,
} from "@/lib/enums";
import { SYMPTOM_TYPES } from "@/lib/schemas/symptom";
import { OBSERVATION_TYPES } from "@/lib/schemas/observation";

// AI 輸出用的 schema：所有欄位必填、不加數值範圍限制，讓各供應商的 strict structured output 都能接受。
// 數值合理性在使用者確認後由領域 schema 驗證。
//
// Claude 的 structured output 每個 schema 最多 16 個 union 型別欄位（含 ["number","null"]），
// 所以「沒有值」盡量不用 null：列舉加 "none"、文字填空字串、不可能為 0 的數值填 0，
// 再用 transform 轉回 null，程式其他地方看到的型別不變。只有 0 有意義的估算值（糖、熱量等）才用 null。

const num = z.number().nullable();

/** 列舉＋"none"（輸出時轉為 null） */
function enumOrNone<const T extends readonly [string, ...string[]]>(values: T) {
  return z.enum([...values, "none"] as [...T, "none"]).transform((v) => (v === "none" ? null : (v as T[number])));
}

/** 文字；空字串轉為 null */
const text = () => z.string().transform((v) => (v.trim() === "" ? null : v));

/** 必須大於 0 的數值；0（或負數）轉為 null */
const positive = () => z.number().transform((v) => (v > 0 ? v : null));

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
  portion: text().describe("份量描述，例如「1 碗」「2 塊」「約 200 g」；無法判斷填空字串"),
  confidence: z.number().describe("對此品項辨識的信心 0–1"),
  nutrition: AiNutritionSchema,
});
export type AiFoodItem = z.output<typeof AiFoodItemSchema>;

export const FoodEstimateSchema = z.strictObject({
  items: z
    .array(z.strictObject({ nutrition: AiNutritionSchema, confidence: z.number().describe("估算信心 0–1") }))
    .describe("與輸入品項相同順序、相同數量"),
});
export type FoodEstimate = z.output<typeof FoodEstimateSchema>;

export const AiDrinkItemSchema = z.strictObject({
  drinkType: z.enum(DRINK_TYPES),
  name: text().describe("飲料名稱，例如 珍珠奶茶、美式咖啡；無法判斷填空字串"),
  volumeMl: positive().describe("容量 ml；無法判斷填 0"),
  caffeineMg: num.describe("估計的咖啡因 mg"),
  sugarG: num.describe("估計的糖 g"),
  alcoholG: num.describe("估計的酒精 g"),
  kcal: num.describe("估計的熱量 kcal"),
  confidence: z.number().describe("對此飲料辨識的信心 0–1"),
});
export type AiDrinkItem = z.output<typeof AiDrinkItemSchema>;

export const FoodPhotoResultSchema = z.strictObject({
  isFood: z.boolean().describe("照片中是否有食物或飲料"),
  mealType: enumOrNone(MEAL_TYPES).describe("依內容推測的餐別，無法判斷填 none"),
  items: z.array(AiFoodItemSchema).describe("食物品項，不含飲料"),
  drinks: z.array(AiDrinkItemSchema).describe("飲料，每杯 / 每瓶一筆"),
  overallConfidence: z.number().describe("整體信心 0–1"),
  satiety: positive().describe("使用者說明中的飽足感 1–5；沒提到填 0"),
  feeling: text().describe("使用者說明中對這餐的感受（精簡原話）；沒有填空字串"),
  notes: text().describe("給使用者的簡短補充，例如看不清楚的部分；沒有填空字串"),
});
export type FoodPhotoResult = z.output<typeof FoodPhotoResultSchema>;

export const AI_EVENT_KINDS = ["food", "drink", "measurement", "exercise", "symptom"] as const;

/** 扁平結構：依 kind 使用對應欄位，其餘填 none / 空字串 / 0（比 union 更容易被各模型正確輸出） */
export const AiEventSchema = z.strictObject({
  kind: z.enum(AI_EVENT_KINDS),
  dayOffset: z.number().describe("相對今天的天數：今天 0、昨天 -1"),
  localTime: text().describe("當地時間 HH:mm（24 小時制）；未提及填空字串"),
  confidence: z.number().describe("對此事件解析的信心 0–1"),

  mealType: enumOrNone(MEAL_TYPES).describe("kind=food 時的餐別；其他填 none"),
  satiety: positive().describe("kind=food 時使用者提到的飽足感 1–5；沒提到或其他 kind 填 0"),
  items: z.array(AiFoodItemSchema).describe("kind=food 時的品項；其他 kind 填空陣列"),

  drinkType: enumOrNone(DRINK_TYPES).describe("kind=drink 時的類型；其他填 none"),
  drinkName: text().describe("kind=drink 時的名稱，例如 無糖拿鐵；其他填空字串"),
  volumeMl: positive().describe("kind=drink 時的容量 ml；未知或其他填 0"),
  caffeineMg: num.describe("kind=drink 時估計的咖啡因 mg"),
  sugarG: num.describe("kind=drink 時估計的糖 g"),
  alcoholG: num.describe("kind=drink 時估計的酒精 g"),
  drinkKcal: num.describe("kind=drink 時估計的熱量 kcal"),

  measurementType: enumOrNone(OBSERVATION_TYPES).describe("kind=measurement 時的量測類型；其他填 none"),
  weightKg: positive().describe("體重 kg；沒有填 0"),
  systolic: positive().describe("收縮壓；沒有填 0"),
  diastolic: positive().describe("舒張壓；沒有填 0"),
  pulse: positive().describe("脈搏；沒有填 0"),
  bpm: positive().describe("心率；沒有填 0"),
  waistCm: positive().describe("腰圍 cm；沒有填 0"),

  exerciseType: enumOrNone(EXERCISE_TYPES).describe("kind=exercise 時的運動類型；其他填 none"),
  durationMin: positive().describe("kind=exercise 或 symptom 時的持續分鐘數；未提及填 0"),
  intensity: enumOrNone(INTENSITIES).describe("kind=exercise 時的強度；未提及填 none"),
  afterMeal: z.boolean().describe("kind=exercise 時是否為飯後運動；未提及填 false"),

  symptomType: enumOrNone(SYMPTOM_TYPES).describe("kind=symptom 時的症狀或生活事件類型；其他填 none"),
  severity: positive().describe("kind=symptom 時的嚴重度 1–5；其他填 0"),
  note: text().describe("kind=symptom 時的簡短描述；kind=food 時對這餐的感受；其他填空字串"),
});
export type AiEvent = z.output<typeof AiEventSchema>;

export const TextParseResultSchema = z.strictObject({
  events: z.array(AiEventSchema),
  unparsed: text().describe("無法歸類的內容，原文保留；沒有則填空字串"),
});
export type TextParseResult = z.output<typeof TextParseResultSchema>;

/** 送給 OpenRouter 的 JSON Schema（模型輸出的格式，即 transform 之前；去掉 $schema 欄位） */
export function toResponseSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export const LabExtractionItemSchema = z.strictObject({
  code: z.string().describe("代碼表中的代碼；不在代碼表中填 OTHER"),
  displayName: z.string().describe("報告上的項目名稱（原文）"),
  value: z.number().nullable().describe("數值結果；質性結果填 null"),
  textValue: z.string().nullable().describe("文字結果，例如 陰性、陽性、1:80、超音波描述；數值結果填 null"),
  unit: z.string().nullable().describe("報告上的單位（原文）"),
  referenceMin: z.number().nullable(),
  referenceMax: z.number().nullable(),
  referenceText: z.string().nullable().describe("參考值原文，例如 <150、陰性"),
  abnormalFlag: z.enum(["low", "high", "critical", "normal", "unknown"]).nullable().describe("報告上的異常標示（H / L / * 等）"),
  page: z.number().nullable().describe("所在頁碼（從 1 開始）"),
  confidence: z.number().describe("辨識信心 0–1"),
});
export type LabExtractionItem = z.infer<typeof LabExtractionItemSchema>;

export const LabExtractionSchema = z.strictObject({
  isHealthReport: z.boolean().describe("是否為健檢或檢驗報告"),
  reportDate: z.string().nullable().describe("檢查日期 YYYY-MM-DD"),
  institution: z.string().nullable().describe("醫療院所名稱"),
  items: z.array(LabExtractionItemSchema),
  notes: z.string().nullable().describe("給使用者的補充，例如模糊無法辨識的頁面"),
});
export type LabExtraction = z.infer<typeof LabExtractionSchema>;

export const SleepScreenshotSchema = z.strictObject({
  isSleepData: z.boolean().describe("截圖是否為睡眠紀錄"),
  wakeDate: z.string().nullable().describe("起床日期 YYYY-MM-DD；截圖沒有日期填 null"),
  sleepStart: z.string().nullable().describe("入睡時刻 HH:mm（24 小時制）"),
  sleepEnd: z.string().nullable().describe("起床時刻 HH:mm（24 小時制）"),
  totalSleepMin: z.number().nullable().describe("總睡眠分鐘數"),
  awakeMin: z.number().nullable(),
  deepMin: z.number().nullable(),
  remMin: z.number().nullable(),
  lightMin: z.number().nullable(),
  avgHeartRate: z.number().nullable().describe("睡眠期間平均心率"),
  hrvMs: z.number().nullable().describe("HRV（毫秒）"),
  confidence: z.number().describe("整體信心 0–1"),
  notes: z.string().nullable(),
});
export type SleepScreenshot = z.infer<typeof SleepScreenshotSchema>;

export const MedicationLabelSchema = z.strictObject({
  isMedication: z.boolean().describe("照片是否為藥品、保健品的包裝、標籤或藥袋"),
  name: z.string().nullable().describe("品名（含規格，例如 Vitamin D3 1000 IU）"),
  category: z.enum(MEDICATION_CATEGORIES).nullable().describe("prescription 處方藥（藥袋）、otc 成藥、supplement 保健品"),
  dosePerIntake: num.describe("標示的每次服用量（數字）"),
  unit: z.string().nullable().describe("每次服用量的單位，例如 顆、錠、粒、包、mL"),
  timing: z.enum(MEDICATION_TIMINGS).nullable().describe("標示的服用時機；沒寫填 null"),
  timesPerDay: num.describe("標示的每日服用次數"),
  confidence: z.number().describe("整體信心 0–1"),
  notes: z.string().nullable().describe("給使用者的補充，例如字跡模糊"),
});
export type MedicationLabel = z.infer<typeof MedicationLabelSchema>;

export const ReviewOutputSchema = z.strictObject({
  headline: z.string().describe("一句話總結這段期間"),
  wins: z.array(z.string()).describe("做得好的地方，最多 4 點"),
  concerns: z.array(z.string()).describe("值得留意的地方，最多 4 點"),
  patterns: z
    .array(
      z.strictObject({
        kind: z.enum(["observation", "correlation", "hypothesis"]),
        text: z.string(),
      }),
    )
    .describe("可能的模式，最多 4 點；必須標明是觀察、相關或假設"),
  nextFocus: z
    .array(z.strictObject({ action: z.string().describe("具體可執行的行動"), why: z.string() }))
    .describe("下一期的重點行動 1–3 個"),
  labFollowUp: z.array(z.string()).describe("建議與醫師討論是否複檢的項目（僅提醒），沒有則空陣列"),
  dataGaps: z.array(z.string()).describe("資料不足、無法判斷的部分"),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;
