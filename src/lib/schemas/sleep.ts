import { z } from "zod";
import { OBSERVATION_SOURCES } from "@/lib/enums";
import { Confidence, IsoDateTime } from "./common";

const minutes = z.number().int().nonnegative();

export const SleepSessionSchema = z.object({
  bedtimeAt: IsoDateTime.optional(),
  sleepStartAt: IsoDateTime.optional(),
  wakeAt: IsoDateTime,
  awakenings: z.number().int().nonnegative().optional(),
  /** 主觀睡眠品質 1–5 */
  quality: z.number().int().min(1).max(5).optional(),
  totalSleepMin: minutes.optional(),
  awakeMin: minutes.optional(),
  deepMin: minutes.optional(),
  remMin: minutes.optional(),
  lightMin: minutes.optional(),
  avgHeartRate: z.number().positive().optional(),
  hrvMs: z.number().positive().optional(),
  source: z.enum(OBSERVATION_SOURCES),
  confidence: Confidence.optional(),
  /** screenshot 來源必須指向原始圖片 */
  originalImageId: z.string().optional(),
});
export type SleepSessionInput = z.infer<typeof SleepSessionSchema>;
