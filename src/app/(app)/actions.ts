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
import { LocalDate } from "@/lib/schemas/common";
import {
  addDrinkEvent,
  addFoodEvent,
  deleteDrinkEvent,
  deleteFoodEvent,
  lastMealItems,
  type FoodItemDraft,
} from "@/server/food";
import { clearMedicationEvent, recordMedicationEvent } from "@/server/medications";
import { deleteLifestyleEntry } from "@/server/lifestyle";
import { addObservation, deleteObservation } from "@/server/observations";
import { DELETABLE_KINDS, type DeletableKind } from "@/server/timeline";

// 所有 action 都可能被直接 POST 呼叫：一律先 requireUser()，資料操作以 user.id 限定。

export async function saveMeasurement(
  type: ObservationType,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!OBSERVATION_TYPES.includes(type)) return { error: "不支援的量測類型" };

  const parsed = parseMeasurementForm(type, formData, user.timezone);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const db = await getDb();
  const { values, occurredAt, note, context } = parsed.data;
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
});

export async function saveFood(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const mealType = z.enum(MEAL_TYPES).safeParse(formString(formData, "mealType"));
  const time = parseOccurredAt(formString(formData, "occurredAt"), user.timezone, new Date());

  const names = formData.getAll("itemName").map((v) => String(v).trim());
  const portions = formData.getAll("itemPortion").map((v) => String(v).trim());
  const rawItems = names
    .map((name, i) => ({ name, portion: portions[i] || undefined }))
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
  const id = await addFoodEvent(db, user, {
    mealType: mealType.data,
    occurredAt: time.occurredAt,
    inputType: formString(formData, "inputType") === "quick_item" ? "quick_item" : "text",
    items: items.data,
    note: formString(formData, "note")?.slice(0, 2000),
  });
  await recordAudit(db, { userId: user.id, action: "food_event.create", entityId: id });
  redirect("/");
}

export async function getLastMeal(mealType: MealType): Promise<FoodItemDraft[]> {
  const user = await requireUser();
  if (!MEAL_TYPES.includes(mealType)) return [];
  return lastMealItems(await getDb(), user.id, mealType);
}

export async function saveDrink(_prev: ActionState, formData: FormData): Promise<ActionState> {
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
  const id = await addDrinkEvent(db, user, {
    drinkType: drinkType.data,
    name,
    occurredAt: time.occurredAt,
    volumeMl: volumeMl.data,
    abvPercent: abvPercent.success ? abvPercent.data : undefined,
  });
  await recordAudit(db, { userId: user.id, action: "drink_event.create", entityId: id });
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
