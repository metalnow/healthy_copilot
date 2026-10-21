import { z } from "zod";

// 未自訂訊息的驗證錯誤一律使用繁體中文
z.config(z.locales.zhTW());

/** ISO 8601 時間，必須帶時區位移，例如 2026-10-20T08:00:00+08:00 */
export const IsoDateTime = z.iso.datetime({ offset: true });

/** 使用者當地日期 YYYY-MM-DD，用於每日 / 每週彙總 */
export const LocalDate = z.iso.date();

/** AI 推論信心值 0–1 */
export const Confidence = z.number().min(0).max(1);

const nonNegative = z.number().nonnegative();

/** 營養估算值，一律視為 Estimated，不得與檢驗值同等可信度呈現 */
export const NutritionEstimateSchema = z.object({
  estimated: z.literal(true).default(true),
  kcal: nonNegative.optional(),
  proteinG: nonNegative.optional(),
  fatG: nonNegative.optional(),
  carbG: nonNegative.optional(),
  fiberG: nonNegative.optional(),
  sugarG: nonNegative.optional(),
  sodiumMg: nonNegative.optional(),
  caffeineMg: nonNegative.optional(),
  alcoholG: nonNegative.optional(),
});
export type NutritionEstimate = z.infer<typeof NutritionEstimateSchema>;
