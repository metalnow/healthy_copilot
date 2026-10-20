import { z } from "zod";
import {
  MEDICATION_CATEGORIES,
  MEDICATION_EVENT_STATUSES,
  MEDICATION_TIMINGS,
} from "@/lib/enums";
import { IsoDateTime } from "./common";

export const MedicationSchema = z.object({
  name: z.string().min(1),
  category: z.enum(MEDICATION_CATEGORIES),
  dose: z.number().positive().optional(),
  unit: z.string().optional(),
  timing: z.enum(MEDICATION_TIMINGS).optional(),
  active: z.boolean().default(true),
});
export type MedicationInput = z.infer<typeof MedicationSchema>;

/** 排程：每天固定時刻，可限定星期幾（0 = 週日） */
export const MedicationScheduleSchema = z.object({
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  dose: z.number().positive().optional(),
});
export type MedicationScheduleInput = z.infer<typeof MedicationScheduleSchema>;

export const MedicationEventSchema = z.object({
  medicationId: z.string().min(1),
  scheduleId: z.string().optional(),
  scheduledAt: IsoDateTime.optional(),
  takenAt: IsoDateTime.optional(),
  status: z.enum(MEDICATION_EVENT_STATUSES),
  actualDose: z.number().positive().optional(),
});
export type MedicationEventInput = z.infer<typeof MedicationEventSchema>;
