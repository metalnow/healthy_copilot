"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { foodEvents } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { EXERCISE_TYPES, INTENSITIES } from "@/lib/enums";
import { formNumber, formString, formStrings, type ActionState } from "@/lib/form";
import { parseOccurredAt } from "@/lib/measurement-form";
import { SYMPTOM_TYPES } from "@/lib/schemas/symptom";
import { minutesBetween } from "@/lib/sleep";
import { toLocalDate } from "@/lib/time";
import { getExtraction, settleExtraction } from "@/server/ai/extractions";
import {
  addExercise,
  addSleep,
  addSymptom,
  updateActivity,
  updateExercise,
  updateSleep,
  updateSymptom,
  upsertActivity,
} from "@/server/lifestyle";

type Errors = Record<string, string>;

/** 修改完成：記錄稽核並回到首頁 */
async function finishUpdate(db: Awaited<ReturnType<typeof getDb>>, userId: string, action: string, id: string, ok: boolean) {
  if (!ok) return { error: "找不到這筆紀錄" } satisfies ActionState;
  await recordAudit(db, { userId, action, entityId: id });
  revalidatePath("/timeline");
  redirect("/");
}

/** 選填數值：空白為 undefined，超出範圍記錄錯誤 */
function optionalInRange(
  formData: FormData,
  key: string,
  min: number,
  max: number,
  message: string,
  errors: Errors,
  integer = true,
) {
  const value = formNumber(formData, key);
  if (value === undefined) return undefined;
  if (Number.isNaN(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    errors[key] = message;
    return undefined;
  }
  return value;
}

export async function saveSleep(sleepId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const now = new Date();
  const errors: Errors = {};

  const time = (key: string, required: boolean) => {
    const raw = formString(formData, key);
    if (!raw) {
      if (required) errors[key] = "請輸入時間";
      return undefined;
    }
    const parsed = parseOccurredAt(raw, user.timezone, now);
    if ("error" in parsed) {
      errors[key] = parsed.error;
      return undefined;
    }
    return parsed.occurredAt;
  };
  const bedtimeAt = time("bedtimeAt", false);
  const sleepStartAt = time("sleepStartAt", false);
  const wakeAt = time("wakeAt", true);
  const start = sleepStartAt ?? bedtimeAt;
  if (!start && !errors.bedtimeAt && !errors.sleepStartAt) errors.bedtimeAt = "請輸入上床或入睡時間";
  if (start && wakeAt && minutesBetween(start, wakeAt) === null) errors.wakeAt = "起床時間必須晚於入睡時間，且間隔小於 24 小時";
  if (bedtimeAt && sleepStartAt && sleepStartAt < bedtimeAt) errors.sleepStartAt = "入睡時間不能早於上床時間";

  const quality = optionalInRange(formData, "quality", 1, 5, "請選擇 1–5", errors);
  const awakenings = optionalInRange(formData, "awakenings", 0, 50, "請輸入 0–50", errors);
  const minutesField = (key: string) => optionalInRange(formData, key, 0, 1440, "請輸入 0–1440 分鐘", errors);
  const totalSleepMin = minutesField("totalSleepMin");
  const awakeMin = minutesField("awakeMin");
  const deepMin = minutesField("deepMin");
  const remMin = minutesField("remMin");
  const lightMin = minutesField("lightMin");
  const avgHeartRate = optionalInRange(formData, "avgHeartRate", 20, 200, "請輸入 20–200", errors);
  const hrvMs = optionalInRange(formData, "hrvMs", 1, 500, "請輸入 1–500", errors);

  if (Object.keys(errors).length > 0 || !wakeAt) return { fieldErrors: errors };

  const db = await getDb();
  if (sleepId) {
    const values = { bedtimeAt, sleepStartAt, wakeAt, quality, awakenings, totalSleepMin, awakeMin, deepMin, remMin, lightMin, avgHeartRate, hrvMs };
    return finishUpdate(db, user.id, "sleep.update", sleepId, await updateSleep(db, user, sleepId, values));
  }
  // 從截圖匯入：以伺服器端的擷取紀錄為準，不採用前端傳來的媒體 id
  const extractionId = formString(formData, "extractionId");
  let screenshot: { originalImageId?: string; confidence?: number; extractionId: string } | undefined;
  if (extractionId) {
    const extraction = await getExtraction(db, user.id, extractionId);
    if (extraction?.task === "sleep_screenshot" && (await settleExtraction(db, user.id, extractionId, "confirmed"))) {
      screenshot = {
        extractionId,
        originalImageId: extraction.inputMediaIds?.[0],
        confidence: extraction.confidence ?? undefined,
      };
    }
  }

  const id = await addSleep(db, user, {
    bedtimeAt,
    sleepStartAt,
    wakeAt,
    quality,
    awakenings,
    totalSleepMin,
    awakeMin,
    deepMin,
    remMin,
    lightMin,
    avgHeartRate,
    hrvMs,
    source: screenshot ? "screenshot" : "manual",
    ...screenshot,
  });
  await recordAudit(db, { userId: user.id, action: "sleep.create", entityId: id, metadata: screenshot ? { via: "screenshot" } : undefined });
  redirect("/");
}

export async function saveActivity(
  activityId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const errors: Errors = {};
  const today = toLocalDate(new Date(), user.timezone);
  const localDate = formString(formData, "localDate");
  if (!localDate || !z.iso.date().safeParse(localDate).success || localDate > today) errors.localDate = "請選擇今天或之前的日期";

  const steps = optionalInRange(formData, "steps", 0, 150000, "請輸入 0–150000 步", errors);
  const distanceKm = optionalInRange(formData, "distanceKm", 0, 300, "請輸入 0–300 公里", errors, false);
  const activeMinutes = optionalInRange(formData, "activeMinutes", 0, 1440, "請輸入 0–1440 分鐘", errors);
  const totalKcal = optionalInRange(formData, "totalKcal", 0, 10000, "請輸入 0–10000 kcal", errors);
  if (steps === undefined && distanceKm === undefined && activeMinutes === undefined && !errors.steps) {
    errors.steps = "請至少輸入步數、距離或活動時間";
  }
  if (Object.keys(errors).length > 0 || !localDate) return { fieldErrors: errors };

  const db = await getDb();
  const distanceM = distanceKm !== undefined ? Math.round(distanceKm * 1000) : undefined;
  if (activityId) {
    const ok = await updateActivity(db, user.id, activityId, { steps, distanceM, activeMinutes, totalKcal });
    return finishUpdate(db, user.id, "activity.update", activityId, ok);
  }
  // 從截圖匯入：確認擷取結果，來源記為截圖（同一天再匯入會覆蓋，當天稍早的截圖不會留下較小的數字）
  const extractionId = formString(formData, "extractionId");
  let source: "manual" | "screenshot" = "manual";
  if (extractionId) {
    const extraction = await getExtraction(db, user.id, extractionId);
    if (extraction?.task === "activity_screenshot" && (await settleExtraction(db, user.id, extractionId, "confirmed"))) {
      source = "screenshot";
    }
  }
  const id = await upsertActivity(db, user.id, { localDate, steps, distanceM, activeMinutes, totalKcal, source });
  await recordAudit(db, { userId: user.id, action: "activity.upsert", entityId: id });
  redirect("/");
}

export async function saveExercise(
  exerciseId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const errors: Errors = {};
  const type = z.enum(EXERCISE_TYPES).safeParse(formString(formData, "type"));
  if (!type.success) errors.type = "請選擇運動類型";
  const intensity = z.enum(INTENSITIES).optional().safeParse(formString(formData, "intensity"));
  const durationMin = optionalInRange(formData, "durationMin", 1, 1440, "請輸入 1–1440 分鐘", errors);
  if (durationMin === undefined && !errors.durationMin) errors.durationMin = "請輸入運動時間";
  const rpe = optionalInRange(formData, "rpe", 1, 10, "請輸入 1–10", errors);
  const kcal = optionalInRange(formData, "kcal", 0, 10000, "請輸入 0–10000 kcal", errors);
  const avgHeartRate = optionalInRange(formData, "avgHeartRate", 30, 250, "請輸入 30–250", errors);
  const maxHeartRate = optionalInRange(formData, "maxHeartRate", 30, 250, "請輸入 30–250", errors);
  const time = parseOccurredAt(formString(formData, "startedAt"), user.timezone, new Date());
  if ("error" in time) errors.startedAt = time.error;
  const note = formString(formData, "note")?.slice(0, 2000);

  if (Object.keys(errors).length > 0 || !type.success || "error" in time || durationMin === undefined) {
    return { fieldErrors: errors };
  }

  const db = await getDb();
  const values = {
    type: type.data,
    startedAt: time.occurredAt,
    durationMin,
    intensity: intensity.success ? intensity.data : undefined,
    rpe,
    kcal,
    avgHeartRate,
    maxHeartRate,
    afterMeal: formData.get("afterMeal") === "on",
    note,
  };
  if (exerciseId) {
    return finishUpdate(db, user.id, "exercise.update", exerciseId, await updateExercise(db, user, exerciseId, values));
  }
  // 從手錶截圖匯入：使用者確認後才把 AI 擷取紀錄標為已確認
  const extractionId = formString(formData, "extractionId");
  const extraction = extractionId ? await getExtraction(db, user.id, extractionId) : null;
  const viaScreenshot =
    extraction?.task === "exercise_screenshot" && (await settleExtraction(db, user.id, extraction.id, "confirmed"));
  const id = await addExercise(db, user, {
    ...values,
    ...(viaScreenshot && { source: "screenshot" as const, extractionId: extraction.id, confidence: extraction.confidence ?? undefined }),
  });
  await recordAudit(db, { userId: user.id, action: "exercise.create", entityId: id });
  redirect("/");
}

export async function saveSymptom(
  symptomId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const errors: Errors = {};
  const type = z.enum(SYMPTOM_TYPES).safeParse(formString(formData, "type"));
  if (!type.success) errors.type = "請選擇類型";
  const severity = optionalInRange(formData, "severity", 1, 5, "請選擇嚴重度", errors);
  if (severity === undefined && !errors.severity) errors.severity = "請選擇嚴重度";
  const durationMin = optionalInRange(formData, "durationMin", 1, 10080, "請輸入 1–10080 分鐘", errors);
  const time = parseOccurredAt(formString(formData, "occurredAt"), user.timezone, new Date());
  if ("error" in time) errors.occurredAt = time.error;

  if (Object.keys(errors).length > 0 || !type.success || "error" in time || severity === undefined) {
    return { fieldErrors: errors };
  }

  const db = await getDb();
  const requestedFoodIds = formStrings(formData, "relatedFoodEventIds").slice(0, 20);
  const ownedFoodIds = requestedFoodIds.length
    ? (
        await db
          .select({ id: foodEvents.id })
          .from(foodEvents)
          .where(and(eq(foodEvents.userId, user.id), inArray(foodEvents.id, requestedFoodIds)))
      ).map((r) => r.id)
    : [];
  const values = {
    type: type.data,
    occurredAt: time.occurredAt,
    severity,
    durationMin,
    note: formString(formData, "note")?.slice(0, 2000),
    relatedFoodEventIds: ownedFoodIds,
  };
  if (symptomId) {
    return finishUpdate(db, user.id, "symptom.update", symptomId, await updateSymptom(db, user, symptomId, values));
  }
  const id = await addSymptom(db, user, values);
  await recordAudit(db, { userId: user.id, action: "symptom.create", entityId: id });
  redirect("/");
}
