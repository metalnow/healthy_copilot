import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { chunkForInsert } from "@/db/batch";
import type { Db } from "@/db/client";
import { drinkEvents, foodEvents, foodItems } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import type { DrinkType, INPUT_TYPES, MealType } from "@/lib/enums";
import type { NutritionEstimate } from "@/lib/schemas/common";
import { eventTimeFields } from "@/lib/time";

type FoodInputType = (typeof INPUT_TYPES)[number];

export type FoodItemDraft = { name: string; portion?: string; nutrition?: NutritionEstimate };

type FoodItemInput = FoodItemDraft & { confidence?: number };

export async function addFoodEvent(
  db: Db,
  user: SessionUser,
  input: {
    mealType: MealType;
    occurredAt: Date;
    inputType: FoodInputType;
    items: FoodItemInput[];
    note?: string;
    satiety?: number;
    totalNutrition?: NutritionEstimate;
    aiConfidence?: number;
    mediaId?: string;
    extractionId?: string;
  },
) {
  const eventId = crypto.randomUUID();
  await db.batch([
    db.insert(foodEvents).values({
      id: eventId,
      userId: user.id,
      mealType: input.mealType,
      ...eventTimeFields(input.occurredAt, user.timezone),
      inputType: input.inputType,
      note: input.note,
      satiety: input.satiety,
      totalNutrition: input.totalNutrition,
      aiConfidence: input.aiConfidence,
      mediaId: input.mediaId,
      extractionId: input.extractionId,
      // 手動輸入或經使用者確認的 AI 結果
      verifiedByUser: true,
    }),
    ...chunkForInsert(
      foodItems,
      input.items.map((item, position) => ({
        foodEventId: eventId,
        position,
        name: item.name,
        portion: item.portion,
        nutrition: item.nutrition,
        confidence: item.confidence,
      })),
    ).map((rows) => db.insert(foodItems).values(rows)),
  ]);
  return eventId;
}

/** 純酒精密度 g/ml */
const ETHANOL_DENSITY = 0.789;

export function alcoholGrams(volumeMl: number, abvPercent: number) {
  return Math.round(volumeMl * (abvPercent / 100) * ETHANOL_DENSITY * 10) / 10;
}

export async function addDrinkEvent(
  db: Db,
  user: SessionUser,
  input: {
    drinkType: DrinkType;
    name?: string;
    occurredAt: Date;
    volumeMl: number;
    abvPercent?: number;
    inputType?: FoodInputType;
    /** AI 估算值；有填 alcoholG 時優先於 abvPercent 換算 */
    caffeineMg?: number;
    sugarG?: number;
    alcoholG?: number;
    nutrition?: NutritionEstimate;
    confidence?: number;
    extractionId?: string;
  },
) {
  const [row] = await db
    .insert(drinkEvents)
    .values({
      userId: user.id,
      drinkType: input.drinkType,
      name: input.name,
      ...eventTimeFields(input.occurredAt, user.timezone),
      inputType: input.inputType ?? "manual",
      volumeMl: input.volumeMl,
      waterMl: input.drinkType === "water" ? input.volumeMl : null,
      caffeineMg: input.caffeineMg,
      sugarG: input.sugarG,
      alcoholG:
        input.alcoholG ??
        (input.drinkType === "alcohol" && input.abvPercent !== undefined
          ? alcoholGrams(input.volumeMl, input.abvPercent)
          : null),
      nutrition: input.nutrition,
      confidence: input.confidence,
      extractionId: input.extractionId,
      verifiedByUser: true,
    })
    .returning({ id: drinkEvents.id });
  return row.id;
}

export async function listFoodForDate(db: Db, userId: string, localDate: string) {
  const events = await db
    .select()
    .from(foodEvents)
    .where(and(eq(foodEvents.userId, userId), eq(foodEvents.localDate, localDate)))
    .orderBy(desc(foodEvents.occurredAt));
  if (events.length === 0) return [];

  const items = await db
    .select()
    .from(foodItems)
    .where(
      inArray(
        foodItems.foodEventId,
        events.map((e) => e.id),
      ),
    )
    .orderBy(foodItems.position);
  return events.map((event) => ({
    ...event,
    items: items.filter((item) => item.foodEventId === event.id),
  }));
}

export async function listDrinksForDate(db: Db, userId: string, localDate: string) {
  return db
    .select()
    .from(drinkEvents)
    .where(and(eq(drinkEvents.userId, userId), eq(drinkEvents.localDate, localDate)))
    .orderBy(desc(drinkEvents.occurredAt));
}

/** 最近吃過的品項，供快速選取 */
export async function recentFoodNames(db: Db, userId: string, limit = 12) {
  const rows = await db
    .select({ name: foodItems.name })
    .from(foodItems)
    .innerJoin(foodEvents, eq(foodItems.foodEventId, foodEvents.id))
    .where(eq(foodEvents.userId, userId))
    .groupBy(foodItems.name)
    .orderBy(desc(sql`max(${foodEvents.occurredAt})`))
    .limit(limit);
  return rows.map((r) => r.name);
}

/** 指定餐別最近一次的品項，供「複製上一次」 */
export async function lastMealItems(
  db: Db,
  userId: string,
  mealType: MealType,
): Promise<FoodItemDraft[]> {
  const [event] = await db
    .select({ id: foodEvents.id })
    .from(foodEvents)
    .where(and(eq(foodEvents.userId, userId), eq(foodEvents.mealType, mealType)))
    .orderBy(desc(foodEvents.occurredAt))
    .limit(1);
  if (!event) return [];
  const items = await db
    .select({ name: foodItems.name, portion: foodItems.portion, nutrition: foodItems.nutrition })
    .from(foodItems)
    .where(eq(foodItems.foodEventId, event.id))
    .orderBy(foodItems.position);
  return items.map((i) => ({ name: i.name, portion: i.portion ?? undefined, nutrition: i.nutrition ?? undefined }));
}

export async function getFoodEvent(db: Db, userId: string, id: string) {
  const [event] = await db
    .select()
    .from(foodEvents)
    .where(and(eq(foodEvents.id, id), eq(foodEvents.userId, userId)))
    .limit(1);
  if (!event) return null;
  const items = await db.select().from(foodItems).where(eq(foodItems.foodEventId, id)).orderBy(foodItems.position);
  return { ...event, items };
}

/** 修改餐別、時間、備註與品項；品項整批替換（保留原本的 AI 來源資訊） */
export async function updateFoodEvent(
  db: Db,
  user: SessionUser,
  id: string,
  input: {
    mealType: MealType;
    occurredAt: Date;
    items: FoodItemInput[];
    note?: string;
    satiety?: number;
    totalNutrition?: NutritionEstimate;
  },
) {
  const existing = await getFoodEvent(db, user.id, id);
  if (!existing) return false;
  await db.batch([
    db
      .update(foodEvents)
      .set({
        mealType: input.mealType,
        ...eventTimeFields(input.occurredAt, user.timezone),
        note: input.note ?? null,
        satiety: input.satiety ?? null,
        totalNutrition: input.totalNutrition ?? null,
      })
      .where(and(eq(foodEvents.id, id), eq(foodEvents.userId, user.id))),
    db.delete(foodItems).where(eq(foodItems.foodEventId, id)),
    ...chunkForInsert(
      foodItems,
      input.items.map((item, position) => ({
        foodEventId: id,
        position,
        name: item.name,
        portion: item.portion,
        nutrition: item.nutrition,
        confidence: item.confidence,
      })),
    ).map((rows) => db.insert(foodItems).values(rows)),
  ]);
  return true;
}

export async function deleteFoodEvent(db: Db, userId: string, id: string) {
  const deleted = await db
    .delete(foodEvents)
    .where(and(eq(foodEvents.id, id), eq(foodEvents.userId, userId)))
    .returning({ id: foodEvents.id });
  return deleted.length > 0;
}

export async function deleteDrinkEvent(db: Db, userId: string, id: string) {
  const deleted = await db
    .delete(drinkEvents)
    .where(and(eq(drinkEvents.id, id), eq(drinkEvents.userId, userId)))
    .returning({ id: drinkEvents.id });
  return deleted.length > 0;
}

export async function getDrinkEvent(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(drinkEvents)
    .where(and(eq(drinkEvents.id, id), eq(drinkEvents.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** 由酒精克數反推酒精濃度，供修改表單預填 */
export function abvFromAlcohol(alcoholG: number | null, volumeMl: number | null) {
  if (!alcoholG || !volumeMl) return undefined;
  return Math.round((alcoholG / (volumeMl * ETHANOL_DENSITY)) * 1000) / 10;
}

/**
 * 修改飲料。類型不變時，咖啡因、糖、熱量等估算值依容量等比例調整；類型改變則清除。
 */
export async function updateDrinkEvent(
  db: Db,
  user: SessionUser,
  id: string,
  input: {
    drinkType: DrinkType;
    name?: string;
    occurredAt: Date;
    volumeMl: number;
    abvPercent?: number;
    /** 使用者這次修改的熱量（含 AI 重新估算）；undefined 表示沒改，沿用原本的估算並依容量調整 */
    nutrition?: NutritionEstimate | null;
  },
) {
  const existing = await getDrinkEvent(db, user.id, id);
  if (!existing) return false;
  const sameType = existing.drinkType === input.drinkType;
  const ratio = sameType && existing.volumeMl ? input.volumeMl / existing.volumeMl : null;
  const scale = (n: number | null | undefined) => (ratio !== null && n != null ? Math.round(n * ratio * 10) / 10 : null);
  const kcal = scale(existing.nutrition?.kcal);

  await db
    .update(drinkEvents)
    .set({
      drinkType: input.drinkType,
      name: input.name ?? null,
      ...eventTimeFields(input.occurredAt, user.timezone),
      volumeMl: input.volumeMl,
      waterMl: input.drinkType === "water" ? input.volumeMl : null,
      caffeineMg: scale(existing.caffeineMg),
      sugarG: input.nutrition?.sugarG ?? scale(existing.sugarG),
      alcoholG:
        input.drinkType !== "alcohol"
          ? null
          : input.abvPercent !== undefined
            ? alcoholGrams(input.volumeMl, input.abvPercent)
            : scale(existing.alcoholG),
      nutrition:
        input.drinkType === "water"
          ? null
          : input.nutrition !== undefined
            ? input.nutrition
            : kcal !== null
              ? { ...existing.nutrition!, kcal }
              : null,
      verifiedByUser: true,
    })
    .where(and(eq(drinkEvents.id, id), eq(drinkEvents.userId, user.id)));
  return true;
}
