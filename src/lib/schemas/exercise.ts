import { z } from "zod";
import { EXERCISE_TYPES, INTENSITIES } from "@/lib/enums";
import { IsoDateTime } from "./common";

export const ExerciseSessionSchema = z.object({
  type: z.enum(EXERCISE_TYPES),
  startedAt: IsoDateTime,
  durationMin: z.number().positive(),
  intensity: z.enum(INTENSITIES).optional(),
  /** 主觀費力程度 RPE 1–10 */
  rpe: z.number().int().min(1).max(10).optional(),
  /** 核心欄位：用於分析飯後活動習慣 */
  afterMeal: z.boolean().optional(),
  note: z.string().max(2000).optional(),
});
export type ExerciseSessionInput = z.infer<typeof ExerciseSessionSchema>;
