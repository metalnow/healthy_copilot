import { z } from "zod";
import { fieldErrorsFrom, formNumber, formString } from "@/lib/form";
import {
  BloodPressureContextSchema,
  OBSERVATION_VALUE_SCHEMAS,
  type ObservationType,
} from "@/lib/schemas/observation";
import { fromDateTimeLocalValue } from "@/lib/time";

/** 每個欄位的提示文字，取代 Zod 的預設訊息 */
const FIELD_HINTS: Record<string, string> = {
  weight: "請輸入 20–400 之間的體重（kg）",
  systolic: "請輸入 50–300 之間的收縮壓",
  diastolic: "請輸入 30–200 之間的舒張壓",
  pulse: "請輸入 20–250 之間的脈搏",
  bpm: "請輸入 20–250 之間的心率",
  waist: "請輸入 40–200 之間的腰圍（cm）",
};

const VALUE_FIELDS: Record<ObservationType, string[]> = {
  weight: ["weight"],
  blood_pressure: ["systolic", "diastolic", "pulse"],
  heart_rate: ["bpm"],
  waist: ["waist"],
};

/** 允許的時間誤差：避免裝置時鐘些微不同就被當成未來時間 */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export type ParsedMeasurement = {
  values: Record<string, number>;
  occurredAt: Date;
  note?: string;
  context?: Record<string, unknown>;
};

export function parseOccurredAt(
  value: string | undefined,
  timeZone: string,
  now: Date,
): { occurredAt: Date } | { error: string } {
  if (!value) return { occurredAt: now };
  let occurredAt: Date;
  try {
    occurredAt = fromDateTimeLocalValue(value, timeZone);
  } catch {
    return { error: "時間格式不正確" };
  }
  if (occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return { error: "時間不能晚於現在" };
  }
  return { occurredAt };
}

export function parseMeasurementForm(
  type: ObservationType,
  formData: FormData,
  timeZone: string,
  now = new Date(),
): { ok: true; data: ParsedMeasurement } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const raw: Record<string, number | undefined> = {};
  for (const field of VALUE_FIELDS[type]) raw[field] = formNumber(formData, field);
  const values = (OBSERVATION_VALUE_SCHEMAS[type] as z.ZodType<Record<string, number>>).safeParse(
    raw,
  );
  if (!values.success) {
    for (const [field, message] of Object.entries(fieldErrorsFrom(values.error.issues))) {
      fieldErrors[field] = FIELD_HINTS[field] ?? message;
    }
  }

  const time = parseOccurredAt(formString(formData, "occurredAt"), timeZone, now);
  if ("error" in time) fieldErrors.occurredAt = time.error;

  let context: Record<string, unknown> | undefined;
  if (type === "blood_pressure") {
    const parsed = BloodPressureContextSchema.safeParse({
      position: formString(formData, "position"),
      arm: formString(formData, "arm"),
      afterRestMinutes: formNumber(formData, "afterRestMinutes"),
      beforeBreakfast: formData.get("beforeBreakfast") === "on" ? true : undefined,
    });
    if (parsed.success) {
      const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
      context = entries.length > 0 ? Object.fromEntries(entries) : undefined;
    } else {
      fieldErrors.context = "量測情境的內容不正確";
    }
  }

  const note = formString(formData, "note");
  if (note && note.length > 2000) fieldErrors.note = "備註最多 2000 字";

  if (Object.keys(fieldErrors).length > 0 || !values.success || "error" in time) {
    return { ok: false, fieldErrors };
  }

  // 去掉沒填的選填欄位（例如血壓的脈搏）
  const cleanValues = Object.fromEntries(
    Object.entries(values.data).filter(([, v]) => v !== undefined),
  );
  return { ok: true, data: { values: cleanValues, occurredAt: time.occurredAt, note, context } };
}
