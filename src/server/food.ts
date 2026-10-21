import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { drinkEvents, foodEvents, foodItems } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import type { DrinkType, MealType } from "@/lib/enums";
import { eventTimeFields } from "@/lib/time";

export type FoodItemDraft = { name: string; portion?: string };

export async function addFoodEvent(
  db: Db,
  user: SessionUser,
  input: {
    mealType: MealType;
    occurredAt: Date;
    inputType: "text" | "quick_item";
    items: FoodItemDraft[];
    note?: string;
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
      // 使用者手動輸入的品項即為確認後資料；營養估算於 Sprint 3 由 AI 補上
      verifiedByUser: true,
    }),
    db.insert(foodItems).values(
      input.items.map((item, position) => ({
        foodEventId: eventId,
        position,
        name: item.name,
        portion: item.portion,
      })),
    ),
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
  },
) {
  const [row] = await db
    .insert(drinkEvents)
    .values({
      userId: user.id,
      drinkType: input.drinkType,
      name: input.name,
      ...eventTimeFields(input.occurredAt, user.timezone),
      inputType: "manual",
      volumeMl: input.volumeMl,
      waterMl: input.drinkType === "water" ? input.volumeMl : null,
      alcoholG:
        input.drinkType === "alcohol" && input.abvPercent !== undefined
          ? alcoholGrams(input.volumeMl, input.abvPercent)
          : null,
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
    .select({ name: foodItems.name, portion: foodItems.portion })
    .from(foodItems)
    .where(eq(foodItems.foodEventId, event.id))
    .orderBy(foodItems.position);
  return items.map((i) => ({ name: i.name, portion: i.portion ?? undefined }));
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
