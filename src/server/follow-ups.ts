import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { healthFollowUps } from "@/db/schema";
import type { FOLLOW_UP_STATUSES } from "@/lib/enums";
import { suggestFindingFollowUps, type FollowUpDraft } from "@/lib/follow-ups";
import { listLabs, summarizeLabs } from "./health";

export type FollowUpRow = typeof healthFollowUps.$inferSelect;
type Status = (typeof FOLLOW_UP_STATUSES)[number];

const STATUS_ORDER: Record<Status, number> = { scheduled: 0, open: 1, done: 2, dismissed: 3 };

/** 進行中的在前（依追蹤日期），已完成 / 不追蹤的在後 */
export async function listFollowUps(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(healthFollowUps)
    .where(eq(healthFollowUps.userId, userId))
    .orderBy(asc(healthFollowUps.createdAt));
  return rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
  );
}

export async function getFollowUp(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(healthFollowUps)
    .where(and(eq(healthFollowUps.id, id), eq(healthFollowUps.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createFollowUp(
  db: Db,
  userId: string,
  input: FollowUpDraft & {
    source: FollowUpRow["source"];
    foundAt?: string | null;
    dueDate?: string | null;
    sourceDocumentId?: string | null;
  },
) {
  const [row] = await db
    .insert(healthFollowUps)
    .values({
      userId,
      finding: input.finding,
      action: input.action,
      department: input.department ?? null,
      labKey: input.labKey ?? null,
      foundAt: input.foundAt ?? null,
      dueDate: input.dueDate ?? null,
      sourceDocumentId: input.sourceDocumentId ?? null,
      source: input.source,
    })
    .returning({ id: healthFollowUps.id });
  return row.id;
}

export async function updateFollowUp(
  db: Db,
  userId: string,
  id: string,
  patch: Partial<Pick<FollowUpRow, "status" | "dueDate" | "completedAt" | "note" | "action" | "department">>,
) {
  const updated = await db
    .update(healthFollowUps)
    .set(patch)
    .where(and(eq(healthFollowUps.id, id), eq(healthFollowUps.userId, userId)))
    .returning({ id: healthFollowUps.id });
  return updated.length > 0;
}

export async function deleteFollowUp(db: Db, userId: string, id: string) {
  const deleted = await db
    .delete(healthFollowUps)
    .where(and(eq(healthFollowUps.id, id), eq(healthFollowUps.userId, userId)))
    .returning({ id: healthFollowUps.id });
  return deleted.length > 0;
}

/** 檢驗結果中需要追蹤、但還沒有追蹤事項的發現 */
export async function findingSuggestions(db: Db, userId: string, followUps?: FollowUpRow[]) {
  const [labs, existing] = await Promise.all([
    listLabs(db, userId),
    followUps ? Promise.resolve(followUps) : listFollowUps(db, userId),
  ]);
  return suggestFindingFollowUps(summarizeLabs(labs), existing);
}
