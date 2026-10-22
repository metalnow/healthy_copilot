"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import type { Db } from "@/db/client";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { DRINK_TYPES, MEAL_TYPES, type MealType } from "@/lib/enums";
import { formNumber, formString, type ActionState } from "@/lib/form";
import { parseMeasurementForm, parseOccurredAt } from "@/lib/measurement-form";
import { OBSERVATION_TYPES, type ObservationType } from "@/lib/schemas/observation";
import { sumNutrition } from "@/lib/ai/draft";
import { LocalDate, NutritionEstimateSchema, type NutritionEstimate } from "@/lib/schemas/common";
import { getExtraction, settleExtraction } from "@/server/ai/extractions";
import {
  addDrinkEvent,
  addFoodEvent,
  deleteDrinkEvent,
  deleteFoodEvent,
  lastMealItems,
  updateDrinkEvent,
  updateFoodEvent,
  type FoodItemDraft,
} from "@/server/food";
import { clearMedicationEvent, recordMedicationEvent } from "@/server/medications";
import { deleteLifestyleEntry } from "@/server/lifestyle";
import {
  addObservation,
  deleteObservation,
  findPulseObservation,
  updateObservation,
} from "@/server/observations";
import { DELETABLE_KINDS, type DeletableKind } from "@/server/timeline";

// 所有 action 都可能被直接 POST 呼叫：一律先 requireUser()，資料操作以 user.id 限定。

export async function saveMeasurement(
  type: ObservationType,
  observationId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!OBSERVATION_TYPES.includes(type)) return { error: "不支援的量測類型" };

  const parsed = parseMeasurementForm(type, formData, user.timezone);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const db = await getDb();
  const { values, occurredAt, note, context } = parsed.data;

  if (observationId) {
    const updated = await updateObservation(db, user, observationId, {
      values,
      occurredAt,
      note,
      // 只有血壓的情境來自表單；其他類型保留原本的 context
      context: type === "blood_pressure" ? (context ?? null) : undefined,
    });
    if (!updated) return { error: "找不到這筆紀錄" };
    await recordAudit(db, { userId: user.id, action: "observation.update", entityType: type, entityId: observationId });

    // 同步血壓附帶的心率：有脈搏就更新或補建，拿掉脈搏就刪除
    if (type === "blood_pressure") {
      const pulseId = await findPulseObservation(db, user.id, observationId);
      if (values.pulse !== undefined && pulseId) {
        await updateObservation(db, user, pulseId, { values: { bpm: values.pulse }, occurredAt });
      } else if (values.pulse !== undefined) {
        await addObservation(db, user, {
          type: "heart_rate",
          values: { bpm: values.pulse },
          occurredAt,
          context: { fromBloodPressure: observationId },
        });
      } else if (pulseId) {
        await deleteObservation(db, user.id, pulseId);
      }
    }
    revalidatePath("/timeline");
    redirect("/");
  }

  const id = await addObservation(db, user, { type, values, occurredAt, note, context });
  await recordAudit(db, { userId: user.id, action: "observation.create", entityType: type, entityId: id });

  // 血壓計通常同時量到脈搏，另存一筆心率
  if (type === "blood_pressure" && values.pulse !== undefined) {
    const hrId = await addObservation(db, user, {
      type: "heart_rate",
      values: { bpm: values.pulse },
      occurredAt,
      context: { fromBloodPressure: id },
    });
    await recordAudit(db, {
      userId: user.id,
      action: "observation.create",
      entityType: "heart_rate",
      entityId: hrId,
    });
  }

  redirect("/");
}

const FoodItemDraftSchema = z.object({
  name: z.string().min(1).max(100, "品名最多 100 字"),
  portion: z.string().max(50, "份量最多 50 字").optional(),
  nutrition: NutritionEstimateSchema.refine((n) => n.kcal === undefined || n.kcal <= 10000, "熱量最多 10000 kcal").optional(),
});

/** 表單隱藏欄位的營養 JSON；格式不對就當作沒有 */
function parseNutritionField(value: string | undefined): NutritionEstimate | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as NutritionEstimate;
  } catch {
    return undefined;
  }
}

export async function saveFood(
  foodEventId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const mealType = z.enum(MEAL_TYPES).safeParse(formString(formData, "mealType"));
  const time = parseOccurredAt(formString(formData, "occurredAt"), user.timezone, new Date());

  const names = formData.getAll("itemName").map((v) => String(v).trim());
  const portions = formData.getAll("itemPortion").map((v) => String(v).trim());
  const nutritions = formData.getAll("itemNutrition").map((v) => parseNutritionField(String(v)));
  const rawItems = names
    .map((name, i) => ({ name, portion: portions[i] || undefined, nutrition: nutritions[i] }))
    .filter((item) => item.name !== "");
  const items = z.array(FoodItemDraftSchema).min(1).max(30).safeParse(rawItems);

  const fieldErrors: Record<string, string> = {};
  if (!mealType.success) fieldErrors.mealType = "請選擇餐別";
  if ("error" in time) fieldErrors.occurredAt = time.error;
  if (!items.success) {
    fieldErrors.items =
      rawItems.length === 0 ? "請至少輸入一項食物" : (items.error.issues[0]?.message ?? "品項不正確");
  }
  if (!mealType.success || "error" in time || !items.success) return { fieldErrors };

  const db = await getDb();
  const values = {
    mealType: mealType.data,
    occurredAt: time.occurredAt,
    items: items.data,
    note: formString(formData, "note")?.slice(0, 2000),
    totalNutrition: sumNutrition(items.data),
  };
  // 使用者按過「AI 估算熱量」並儲存，即視為確認估算結果
  const extractionId = formString(formData, "extractionId");
  const extraction = extractionId ? await getExtraction(db, user.id, extractionId) : null;
  if (extraction?.task === "food_estimate") await settleExtraction(db, user.id, extraction.id, "confirmed");

  if (foodEventId) {
    if (!(await updateFoodEvent(db, user, foodEventId, values))) return { error: "找不到這筆紀錄" };
    await recordAudit(db, { userId: user.id, action: "food_event.update", entityId: foodEventId });
  } else {
    const id = await addFoodEvent(db, user, {
      ...values,
      inputType: formString(formData, "inputType") === "quick_item" ? "quick_item" : "text",
    });
    await recordAudit(db, { userId: user.id, action: "food_event.create", entityId: id });
  }
  revalidatePath("/timeline");
  redirect("/");
}

export async function getLastMeal(mealType: MealType): Promise<FoodItemDraft[]> {
  const user = await requireUser();
  if (!MEAL_TYPES.includes(mealType)) return [];
  return lastMealItems(await getDb(), user.id, mealType);
}

export async function saveDrink(
  drinkEventId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const drinkType = z.enum(DRINK_TYPES).safeParse(formString(formData, "drinkType"));
  const volumeMl = z.number().min(1).max(5000).safeParse(formNumber(formData, "volumeMl"));
  const abv = formNumber(formData, "abvPercent");
  const abvPercent = z.number().min(0).max(100).optional().safeParse(abv);
  const name = formString(formData, "name");
  const time = parseOccurredAt(formString(formData, "occurredAt"), user.timezone, new Date());

  const fieldErrors: Record<string, string> = {};
  if (!drinkType.success) fieldErrors.drinkType = "請選擇飲料類型";
  if (!volumeMl.success) fieldErrors.volumeMl = "請輸入 1–5000 之間的容量（ml）";
  if (!abvPercent.success) fieldErrors.abvPercent = "酒精濃度請輸入 0–100 之間的數字";
  if (name && name.length > 100) fieldErrors.name = "名稱最多 100 字";
  if ("error" in time) fieldErrors.occurredAt = time.error;
  if (Object.keys(fieldErrors).length > 0 || !drinkType.success || !volumeMl.success || "error" in time) {
    return { fieldErrors };
  }

  const db = await getDb();
  const values = {
    drinkType: drinkType.data,
    name: drinkType.data === "water" ? undefined : name,
    occurredAt: time.occurredAt,
    volumeMl: volumeMl.data,
    abvPercent: abvPercent.success ? abvPercent.data : undefined,
  };
  if (drinkEventId) {
    if (!(await updateDrinkEvent(db, user, drinkEventId, values))) return { error: "找不到這筆紀錄" };
    await recordAudit(db, { userId: user.id, action: "drink_event.update", entityId: drinkEventId });
    revalidatePath("/timeline");
  } else {
    const id = await addDrinkEvent(db, user, values);
    await recordAudit(db, { userId: user.id, action: "drink_event.create", entityId: id });
  }
  redirect("/");
}

export async function deleteEntry(formData: FormData) {
  const user = await requireUser();
  const kind = z.enum(DELETABLE_KINDS).safeParse(formString(formData, "kind"));
  const id = formString(formData, "id");
  if (!kind.success || !id) return;

  const db = await getDb();
  const remove: Record<DeletableKind, (db: Db, userId: string, id: string) => Promise<boolean>> = {
    observation: deleteObservation,
    food_event: deleteFoodEvent,
    drink_event: deleteDrinkEvent,
    sleep: (d, u, i) => deleteLifestyleEntry(d, u, "sleep", i),
    activity: (d, u, i) => deleteLifestyleEntry(d, u, "activity", i),
    exercise: (d, u, i) => deleteLifestyleEntry(d, u, "exercise", i),
    symptom: (d, u, i) => deleteLifestyleEntry(d, u, "symptom", i),
  };
  if (await remove[kind.data](db, user.id, id)) {
    await recordAudit(db, { userId: user.id, action: `${kind.data}.delete`, entityId: id });
  }
  revalidatePath("/");
  revalidatePath("/timeline");
}

export async function updateMedicationCheck(formData: FormData) {
  const user = await requireUser();
  const scheduleId = formString(formData, "scheduleId");
  const localDate = LocalDate.safeParse(formString(formData, "localDate"));
  const action = z.enum(["take", "skip", "clear"]).safeParse(formString(formData, "action"));
  if (!scheduleId || !localDate.success || !action.success) return;

  const db = await getDb();
  if (action.data === "clear") {
    await clearMedicationEvent(db, user.id, scheduleId, localDate.data);
  } else {
    const id = await recordMedicationEvent(db, user, {
      scheduleId,
      localDate: localDate.data,
      action: action.data,
    });
    if (id) {
      await recordAudit(db, { userId: user.id, action: `medication_event.${action.data}`, entityId: id });
    }
  }
  revalidatePath("/");
}
