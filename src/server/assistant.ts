import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { foodEvents, healthDocuments, observations } from "@/db/schema";
import { buildAssistantMessages, greeting } from "@/lib/assistant";
import type { SessionUser } from "@/lib/auth/session";
import { toLocalDate, toLocalTime } from "@/lib/time";
import { findingSuggestions, listFollowUps } from "./follow-ups";
import { goalSuggestions } from "./health";
import { getChecklist } from "./medications";

/** 助理目前要說的話：依優先順序，沒有提醒時打招呼 */
export async function assistantMessages(db: Db, user: Pick<SessionUser, "id" | "timezone">) {
  const now = new Date();
  const today = toLocalDate(now, user.timezone);
  const [checklist, followUps, reports, food, weight, goals] = await Promise.all([
    getChecklist(db, user.id, today),
    listFollowUps(db, user.id),
    db
      .select({ n: count() })
      .from(healthDocuments)
      .where(and(eq(healthDocuments.userId, user.id), inArray(healthDocuments.status, ["review"]))),
    db
      .select({ n: count() })
      .from(foodEvents)
      .where(and(eq(foodEvents.userId, user.id), eq(foodEvents.localDate, today))),
    db
      .select({ date: observations.localDate })
      .from(observations)
      .where(and(eq(observations.userId, user.id), eq(observations.type, "weight")))
      .orderBy(desc(observations.occurredAt))
      .limit(1),
    goalSuggestions(db, user),
  ]);
  const findings = await findingSuggestions(db, user.id, followUps);

  const messages = buildAssistantMessages({
    today,
    now: toLocalTime(now, user.timezone),
    medications: checklist
      .filter((item) => !item.event || item.event.status === "unknown")
      .map((item) => ({ scheduleId: item.scheduleId, name: item.name, localTime: item.localTime })),
    followUps: followUps.flatMap((f) =>
      f.status === "open" || f.status === "scheduled"
        ? [{ id: f.id, finding: f.finding, action: f.action, status: f.status, dueDate: f.dueDate }]
        : [],
    ),
    findingSuggestions: findings.length,
    reportsToConfirm: reports[0]?.n ?? 0,
    foodRecordsToday: food[0]?.n ?? 0,
    lastWeightDate: weight[0]?.date ?? null,
    goalSuggestions: goals.length,
  });
  return messages.length > 0 ? messages : [greeting(toLocalTime(now, user.timezone))];
}
