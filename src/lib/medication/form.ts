import { fieldErrorsFrom, formNumber, formString, formStrings } from "@/lib/form";
import {
  MedicationSchema,
  MedicationScheduleSchema,
  type MedicationInput,
  type MedicationScheduleInput,
} from "@/lib/schemas/medication";

const FIELD_HINTS: Record<string, string> = {
  name: "請輸入名稱（最多 100 字）",
  category: "請選擇類別",
  dose: "劑量必須是大於 0 的數字",
  timing: "請選擇服用時機",
};

export function parseMedicationForm(
  formData: FormData,
):
  | { ok: true; medication: MedicationInput; schedules: MedicationScheduleInput[] }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};

  const name = formString(formData, "name");
  const medication = MedicationSchema.safeParse({
    name: name && name.length <= 100 ? name : undefined,
    category: formString(formData, "category"),
    dose: formNumber(formData, "dose"),
    unit: formString(formData, "unit")?.slice(0, 20),
    timing: formString(formData, "timing"),
    active: formData.get("active") !== "false",
  });
  if (!medication.success) {
    for (const [field, message] of Object.entries(fieldErrorsFrom(medication.error.issues))) {
      fieldErrors[field] = FIELD_HINTS[field] ?? message;
    }
  }

  // 勾選全部或都不勾都視為每天
  const days = [...new Set(formStrings(formData, "daysOfWeek").map(Number))].sort();
  const daysOfWeek = days.length === 0 || days.length === 7 ? undefined : days;

  const times = [...new Set(formStrings(formData, "localTime"))].sort();
  const schedules = times.map((localTime) =>
    MedicationScheduleSchema.safeParse({ localTime, daysOfWeek }),
  );
  if (times.length === 0) fieldErrors.localTime = "請至少設定一個服用時間";
  else if (times.length > 6) fieldErrors.localTime = "每天最多 6 個服用時間";
  else if (schedules.some((s) => !s.success)) fieldErrors.localTime = "服用時間或星期設定不正確";

  if (!medication.success || Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    medication: medication.data,
    schedules: schedules.map((s) => s.data as MedicationScheduleInput),
  };
}
