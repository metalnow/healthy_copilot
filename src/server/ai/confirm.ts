import type { Db } from "@/db/client";
import type { SessionUser } from "@/lib/auth/session";
import {
  occurredAtInstant,
  sumNutrition,
  validateMeasurementValues,
  type ConfirmDraft,
} from "@/lib/ai/draft";
import { recordAudit } from "@/lib/audit";
import { addDrinkEvent, addFoodEvent } from "@/server/food";
import { addExercise, addSymptom } from "@/server/lifestyle";
import { addObservation } from "@/server/observations";
import { getExtraction, settleExtraction } from "./extractions";

const INPUT_TYPE_BY_TASK = {
  food_vision: "photo",
  voice_input: "voice",
  text_parse: "text",
} as const;

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** 驗證使用者確認後的草稿並寫入；回傳錯誤訊息或 null */
export async function confirmDraft(db: Db, user: SessionUser, draft: ConfirmDraft): Promise<string | null> {
  const extraction = await getExtraction(db, user.id, draft.extractionId);
  if (!extraction) return "找不到這筆 AI 結果";
  if (extraction.status !== "succeeded") return "這筆 AI 結果已經處理過了";
  const inputType = INPUT_TYPE_BY_TASK[extraction.task as keyof typeof INPUT_TYPE_BY_TASK];
  if (!inputType) return "不支援的 AI 任務";

  const now = Date.now();
  for (const event of draft.events) {
    if (occurredAtInstant(event, user.timezone).getTime() > now + FUTURE_TOLERANCE_MS) {
      return "時間不能晚於現在";
    }
    if (event.kind === "measurement" && !validateMeasurementValues(event).success) {
      return "量測數值超出合理範圍，請檢查";
    }
  }

  // 先標記為已確認，避免重複送出造成重複紀錄
  if (!(await settleExtraction(db, user.id, extraction.id, "confirmed"))) {
    return "這筆 AI 結果已經處理過了";
  }

  const extractionId = extraction.id;
  const mediaId = extraction.task === "food_vision" ? extraction.inputMediaIds?.[0] : undefined;

  for (const event of draft.events) {
    const occurredAt = occurredAtInstant(event, user.timezone);
    if (event.kind === "food") {
      const id = await addFoodEvent(db, user, {
        mealType: event.mealType,
        occurredAt,
        inputType,
        items: event.items,
        satiety: event.satiety,
        note: event.note || undefined,
        totalNutrition: sumNutrition(event.items),
        aiConfidence: event.confidence,
        mediaId,
        extractionId,
      });
      await recordAudit(db, { userId: user.id, action: "food_event.create", entityId: id, metadata: { via: "ai" } });
    } else if (event.kind === "drink") {
      const id = await addDrinkEvent(db, user, {
        drinkType: event.drinkType,
        name: event.name,
        occurredAt,
        volumeMl: event.volumeMl,
        inputType,
        caffeineMg: event.caffeineMg,
        sugarG: event.sugarG,
        alcoholG: event.alcoholG,
        nutrition: event.kcal !== undefined ? { estimated: true, kcal: event.kcal } : undefined,
        confidence: event.confidence,
        extractionId,
      });
      await recordAudit(db, { userId: user.id, action: "drink_event.create", entityId: id, metadata: { via: "ai" } });
    } else if (event.kind === "exercise") {
      const id = await addExercise(db, user, {
        type: event.exerciseType,
        startedAt: occurredAt,
        durationMin: event.durationMin,
        intensity: event.intensity,
        afterMeal: event.afterMeal,
        source: "ai_extract",
        confidence: event.confidence,
        extractionId,
      });
      await recordAudit(db, { userId: user.id, action: "exercise.create", entityId: id, metadata: { via: "ai" } });
    } else if (event.kind === "symptom") {
      const id = await addSymptom(db, user, {
        type: event.symptomType,
        occurredAt,
        severity: event.severity,
        durationMin: event.durationMin,
        note: event.note,
        source: "ai_extract",
        confidence: event.confidence,
        extractionId,
      });
      await recordAudit(db, { userId: user.id, action: "symptom.create", entityId: id, metadata: { via: "ai" } });
    } else {
      const values = validateMeasurementValues(event).data as Record<string, number>;
      const id = await addObservation(db, user, {
        type: event.measurementType,
        values,
        occurredAt,
        source: "ai_extract",
        confidence: event.confidence,
        extractionId,
      });
      await recordAudit(db, {
        userId: user.id,
        action: "observation.create",
        entityType: event.measurementType,
        entityId: id,
        metadata: { via: "ai" },
      });
      // 與手動輸入一致：血壓附帶的脈搏另存一筆心率
      if (event.measurementType === "blood_pressure" && values.pulse !== undefined) {
        await addObservation(db, user, {
          type: "heart_rate",
          values: { bpm: values.pulse },
          occurredAt,
          source: "ai_extract",
          confidence: event.confidence,
          extractionId,
          context: { fromBloodPressure: id },
        });
      }
    }
  }
  return null;
}
