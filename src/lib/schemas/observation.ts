import { z } from "zod";
import { OBSERVATION_SOURCES } from "@/lib/enums";
import { Confidence, IsoDateTime } from "./common";

/** P0 量測項目；P1 項目（體脂、SpO₂、血糖、HRV…）之後加入 */
export const OBSERVATION_TYPES = [
  "weight",
  "blood_pressure",
  "heart_rate",
  "waist",
] as const;

export const ObservationSchema = z.object({
  type: z.enum(OBSERVATION_TYPES),
  timestamp: IsoDateTime,
  values: z.record(z.string(), z.union([z.number(), z.string()])),
  unit: z.string().optional(),
  source: z.enum(OBSERVATION_SOURCES),
  confidence: Confidence.optional(),
  note: z.string().max(2000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});
export type ObservationInput = z.infer<typeof ObservationSchema>;

/** 血壓量測情境，例如 { position: "sitting", afterRestMinutes: 5 } */
export const BloodPressureContextSchema = z.object({
  position: z.enum(["sitting", "standing", "lying"]).optional(),
  afterRestMinutes: z.number().int().nonnegative().optional(),
  beforeBreakfast: z.boolean().optional(),
  arm: z.enum(["left", "right"]).optional(),
});
