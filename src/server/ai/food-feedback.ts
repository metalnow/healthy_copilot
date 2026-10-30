import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { aiExtractions, foodEvents, foodItems, userSettings } from "@/db/schema";
import { personalFoodContext, summarizeFoodFeedback, type FeedbackItem, type FeedbackSample } from "@/lib/ai/food-feedback";

/** 參考最近幾次照片辨識的修正 */
const RECENT_SAMPLES = 30;

type StoredPhoto = { items?: { name?: string; portion?: string | null; inferred?: boolean }[]; userNote?: string | null };

/** 最近確認過的照片辨識：AI 原本的品項 vs 實際存下的品項 */
export async function foodFeedbackSamples(db: Db, userId: string): Promise<FeedbackSample[]> {
  const extractions = await db
    .select({ id: aiExtractions.id, parsed: aiExtractions.parsedOutput })
    .from(aiExtractions)
    .where(and(eq(aiExtractions.userId, userId), eq(aiExtractions.task, "food_vision"), eq(aiExtractions.status, "confirmed")))
    .orderBy(desc(aiExtractions.createdAt))
    .limit(RECENT_SAMPLES);
  if (extractions.length === 0) return [];

  const events = await db
    .select({ id: foodEvents.id, extractionId: foodEvents.extractionId })
    .from(foodEvents)
    .where(
      and(
        eq(foodEvents.userId, userId),
        inArray(
          foodEvents.extractionId,
          extractions.map((e) => e.id),
        ),
      ),
    );
  if (events.length === 0) return [];
  const items = await db
    .select({ foodEventId: foodItems.foodEventId, name: foodItems.name, portion: foodItems.portion })
    .from(foodItems)
    .where(
      inArray(
        foodItems.foodEventId,
        events.map((e) => e.id),
      ),
    );

  // 使用者之後刪掉整筆飲食紀錄的，無法判斷是誤判還是其他原因，不列入
  return extractions.flatMap((extraction) => {
    const eventIds = new Set(events.filter((e) => e.extractionId === extraction.id).map((e) => e.id));
    if (eventIds.size === 0) return [];
    const parsed = (extraction.parsed ?? {}) as StoredPhoto;
    const ai: FeedbackItem[] = (parsed.items ?? [])
      .filter((i) => typeof i.name === "string" && i.name.trim() !== "")
      .map((i) => ({ name: i.name!.trim(), portion: i.portion ?? null, inferred: i.inferred === true }));
    const saved = items.filter((i) => eventIds.has(i.foodEventId)).map((i) => ({ name: i.name, portion: i.portion }));
    return [{ ai, saved, note: parsed.userNote ?? null }];
  });
}

export async function foodPhotoSettings(db: Db, userId: string) {
  const [row] = await db
    .select({ hints: userSettings.foodPhotoHints, learning: userSettings.foodPhotoLearning })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return { hints: row?.hints ?? null, learning: row?.learning ?? true };
}

/** 照片辨識時附上的個人化說明（使用者寫的習慣 + 從修正學到的） */
export async function foodPhotoPersonalization(db: Db, userId: string) {
  const settings = await foodPhotoSettings(db, userId);
  const learned = settings.learning ? summarizeFoodFeedback(await foodFeedbackSamples(db, userId)) : [];
  return { ...settings, learned, context: personalFoodContext({ hints: settings.hints, learned }) };
}
