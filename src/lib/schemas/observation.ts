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

/** 各量測類型的數值範圍；範圍刻意寬鬆，只用來擋輸入錯誤 */
export const OBSERVATION_VALUE_SCHEMAS = {
  weight: z.object({ weight: z.number().min(20).max(400) }),
  blood_pressure: z
    .object({
      systolic: z.number().int().min(50).max(300),
      diastolic: z.number().int().min(30).max(200),
      pulse: z.number().int().min(20).max(250).optional(),
    })
    .refine((v) => v.systolic > v.diastolic, { message: "收縮壓必須大於舒張壓" }),
  heart_rate: z.object({ bpm: z.number().int().min(20).max(250) }),
  waist: z.object({ waist: z.number().min(40).max(200) }),
} as const satisfies Record<ObservationType, z.ZodType>;

export type ObservationType = (typeof OBSERVATION_TYPES)[number];
export type ObservationValues<T extends ObservationType> = z.infer<
  (typeof OBSERVATION_VALUE_SCHEMAS)[T]
>;

export const OBSERVATION_UNITS: Record<ObservationType, string> = {
  weight: "kg",
  blood_pressure: "mmHg",
  heart_rate: "bpm",
  waist: "cm",
};
