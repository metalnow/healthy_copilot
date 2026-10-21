import { z } from "zod";
import { ABNORMAL_FLAGS, LAB_SOURCES } from "@/lib/enums";
import { Confidence, LocalDate } from "./common";

export const LabObservationSchema = z.object({
  /** 內部統一代碼（例如 HBA1C、TG、LDL），對應表於 Sprint 4 建立 */
  code: z.string().min(1),
  displayName: z.string().min(1),
  value: z.number().optional(),
  textValue: z.string().optional(),
  unit: z.string().optional(),
  measuredAt: LocalDate,
  referenceMin: z.number().optional(),
  referenceMax: z.number().optional(),
  referenceText: z.string().optional(),
  abnormalFlag: z.enum(ABNORMAL_FLAGS).optional(),
  sourceDocumentId: z.string().optional(),
  sourcePage: z.number().int().positive().optional(),
  source: z.enum(LAB_SOURCES),
  confidence: Confidence.optional(),
});
export type LabObservationInput = z.infer<typeof LabObservationSchema>;
