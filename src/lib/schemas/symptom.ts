import { z } from "zod";
import { IsoDateTime } from "./common";

export const SYMPTOM_TYPES = [
  "hives",
  "dizziness",
  "palpitations",
  "abdominal_pain",
  "diarrhea",
  "headache",
  "fatigue",
  "allergic_reaction",
  "fever",
  "chest_pain",
  "dyspnea",
  "syncope",
  "alcohol",
  "late_night",
  "illness",
  "stress_event",
  "other",
] as const;

export const SymptomEventSchema = z.object({
  type: z.enum(SYMPTOM_TYPES),
  occurredAt: IsoDateTime,
  severity: z.number().int().min(1).max(5),
  durationMin: z.number().int().positive().optional(),
  note: z.string().max(2000).optional(),
  relatedFoodEventIds: z.array(z.string()).optional(),
  medicationEventIds: z.array(z.string()).optional(),
});
export type SymptomEventInput = z.infer<typeof SymptomEventSchema>;
