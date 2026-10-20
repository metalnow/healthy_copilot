import { z } from "zod";
import { DRINK_TYPES, INPUT_TYPES, MEAL_TYPES } from "@/lib/enums";
import { Confidence, IsoDateTime, NutritionEstimateSchema } from "./common";

export const FoodItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive().optional(),
  /** 份量描述，例如「1 碗」「大杯」「200 g」 */
  portion: z.string().optional(),
  cookingMethod: z.string().optional(),
  hasSauce: z.boolean().optional(),
  nutrition: NutritionEstimateSchema.optional(),
  confidence: Confidence.optional(),
});
export type FoodItemInput = z.infer<typeof FoodItemSchema>;

export const FoodEventSchema = z.object({
  mealType: z.enum(MEAL_TYPES),
  occurredAt: IsoDateTime,
  inputType: z.enum(INPUT_TYPES),
  foodItems: z.array(FoodItemSchema).min(1),
  totalNutrition: NutritionEstimateSchema.optional(),
  aiConfidence: Confidence.optional(),
  note: z.string().max(2000).optional(),
});
export type FoodEventInput = z.infer<typeof FoodEventSchema>;

export const DrinkEventSchema = z.object({
  drinkType: z.enum(DRINK_TYPES),
  name: z.string().optional(),
  occurredAt: IsoDateTime,
  inputType: z.enum(INPUT_TYPES),
  volumeMl: z.number().positive().optional(),
  waterMl: z.number().nonnegative().optional(),
  caffeineMg: z.number().nonnegative().optional(),
  sugarG: z.number().nonnegative().optional(),
  alcoholG: z.number().nonnegative().optional(),
  /** 拿鐵、含糖飲料等也有熱量與營養，同樣標記為估算 */
  nutrition: NutritionEstimateSchema.optional(),
  confidence: Confidence.optional(),
});
export type DrinkEventInput = z.infer<typeof DrinkEventSchema>;
