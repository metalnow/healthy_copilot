import { and, count, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { aiExtractions, type AiUsage } from "@/db/schema";
import type { AI_TASKS, ModelProfileKey } from "@/lib/enums";

/** 每位使用者每小時的 AI 請求上限，避免誤觸或迴圈造成大量費用 */
export const HOURLY_AI_LIMIT = 60;

export async function isOverHourlyLimit(db: Db, userId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(aiExtractions)
    .where(and(eq(aiExtractions.userId, userId), gte(aiExtractions.createdAt, new Date(Date.now() - 3600_000))));
  return (row?.n ?? 0) >= HOURLY_AI_LIMIT;
}

export async function createExtraction(
  db: Db,
  input: {
    userId: string;
    task: (typeof AI_TASKS)[number];
    modelProfile: ModelProfileKey;
    modelId: string;
    inputMediaIds?: string[];
  },
) {
  const [row] = await db.insert(aiExtractions).values(input).returning({ id: aiExtractions.id });
  return row.id;
}

export async function completeExtraction(
  db: Db,
  id: string,
  result: {
    parsedOutput: unknown;
    rawOutput?: unknown;
    confidence?: number;
    usage: AiUsage;
    durationMs: number;
  },
) {
  await db
    .update(aiExtractions)
    .set({ status: "succeeded", completedAt: new Date(), ...result })
    .where(eq(aiExtractions.id, id));
}

export async function failExtraction(
  db: Db,
  id: string,
  result: { error: string; usage?: AiUsage; durationMs: number },
) {
  await db
    .update(aiExtractions)
    .set({ status: "failed", completedAt: new Date(), ...result })
    .where(eq(aiExtractions.id, id));
}

export async function getExtraction(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(aiExtractions)
    .where(and(eq(aiExtractions.id, id), eq(aiExtractions.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** 只有成功且尚未處理的擷取結果可以確認或捨棄（避免重複儲存） */
export async function settleExtraction(
  db: Db,
  userId: string,
  id: string,
  status: "confirmed" | "discarded",
) {
  const updated = await db
    .update(aiExtractions)
    .set({ status })
    .where(and(eq(aiExtractions.id, id), eq(aiExtractions.userId, userId), eq(aiExtractions.status, "succeeded")))
    .returning({ id: aiExtractions.id });
  return updated.length > 0;
}

/** 某段期間的 AI 費用（OpenRouter credits，約等於美元）與次數 */
export async function usageSince(db: Db, userId: string, since: Date) {
  const [row] = await db
    .select({
      requests: count(),
      cost: sql<number>`coalesce(sum(json_extract(${aiExtractions.usage}, '$.totalCost')), 0)`,
    })
    .from(aiExtractions)
    .where(and(eq(aiExtractions.userId, userId), gte(aiExtractions.createdAt, since)));
  return { requests: row?.requests ?? 0, cost: Number(row?.cost ?? 0) };
}
