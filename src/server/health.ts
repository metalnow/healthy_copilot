import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { chunkForInsert, runBatch } from "@/db/batch";
import type { Db } from "@/db/client";
import {
  activityDaily,
  exerciseSessions,
  healthDocuments,
  healthFollowUps,
  healthGoals,
  healthProfiles,
  labObservations,
  mediaObjects,
  observations,
  sleepSessions,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { dueDateFor } from "@/lib/follow-ups";
import { suggestGoals } from "@/lib/goal-suggestions";
import { goalDirection } from "@/lib/goals";
import { canonicalLabName, isGroupedByName } from "@/lib/labs/catalog";
import { toLabObservationValues, type ConfirmLabs, type LabDraftItem } from "@/lib/labs/review";
import { sleepDurationMin } from "@/lib/sleep";
import { toLocalDate } from "@/lib/time";
import { settleExtraction } from "@/server/ai/extractions";
import { intakeAverage } from "@/server/food";

export type LabRow = typeof labObservations.$inferSelect;
export type HealthDocumentRow = typeof healthDocuments.$inferSelect;

// ─── 健檢文件 ──────────────────────────────────────────────

export async function listHealthDocuments(db: Db, userId: string) {
  return db
    .select()
    .from(healthDocuments)
    .where(eq(healthDocuments.userId, userId))
    .orderBy(desc(healthDocuments.createdAt));
}

export async function getHealthDocument(db: Db, userId: string, id: string) {
  const [doc] = await db
    .select()
    .from(healthDocuments)
    .where(and(eq(healthDocuments.id, id), eq(healthDocuments.userId, userId)))
    .limit(1);
  return doc ?? null;
}

export async function documentMedia(db: Db, userId: string, doc: HealthDocumentRow) {
  const ids = doc.pageMediaIds?.length ? doc.pageMediaIds : [doc.mediaId];
  const rows = await db
    .select()
    .from(mediaObjects)
    .where(and(inArray(mediaObjects.id, ids), eq(mediaObjects.userId, userId)));
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r) => r !== undefined);
}

/** 確認擷取結果：寫入檢驗值並把文件標記為已確認 */
export async function confirmLabReport(db: Db, user: SessionUser, input: ConfirmLabs): Promise<string | null> {
  const doc = await getHealthDocument(db, user.id, input.documentId);
  if (!doc) return "找不到這份報告";
  if (doc.status !== "review") return "這份報告目前無法確認";

  // 先改狀態，避免重複送出
  const claimed = await db
    .update(healthDocuments)
    .set({ status: "confirmed", reportDate: input.reportDate, institution: input.institution ?? doc.institution })
    .where(and(eq(healthDocuments.id, doc.id), eq(healthDocuments.status, "review")))
    .returning({ id: healthDocuments.id });
  if (claimed.length === 0) return "這份報告已經確認過了";
  if (doc.extractionId) await settleExtraction(db, user.id, doc.extractionId, "confirmed");

  const rows = input.items.map((item) => ({
    userId: user.id,
    ...toLabObservationValues(item),
    measuredAt: input.reportDate,
    sourceDocumentId: doc.id,
    source: "ai_extract" as const,
    extractionId: doc.extractionId,
    verifiedByUser: true,
  }));
  const followUps = input.followUps.map((f) => ({
    userId: user.id,
    finding: f.finding,
    action: f.action,
    department: f.department ?? null,
    labKey: f.labKey ?? null,
    sourceDocumentId: doc.id,
    foundAt: input.reportDate,
    dueDate: dueDateFor(input.reportDate, f.intervalMonths),
    source: "report" as const,
  }));
  await runBatch(db, [
    ...chunkForInsert(labObservations, rows).map((chunk) => db.insert(labObservations).values(chunk)),
    ...chunkForInsert(healthFollowUps, followUps).map((chunk) => db.insert(healthFollowUps).values(chunk)),
  ]);
  return null;
}

/** 刪除報告：連同由它擷取的檢驗值、媒體索引與 R2 原始檔 */
export async function deleteHealthDocument(db: Db, bucket: R2Bucket, userId: string, id: string) {
  const doc = await getHealthDocument(db, userId, id);
  if (!doc) return false;
  const pages = await documentMedia(db, userId, doc);
  // 抽出的報告文字不算頁面，另外一起刪除
  const text = doc.textMediaId
    ? await db
        .select()
        .from(mediaObjects)
        .where(and(eq(mediaObjects.id, doc.textMediaId), eq(mediaObjects.userId, userId)))
    : [];
  const media = [...pages, ...text];
  await db.batch([
    db.delete(labObservations).where(and(eq(labObservations.sourceDocumentId, id), eq(labObservations.userId, userId))),
    db.delete(healthFollowUps).where(and(eq(healthFollowUps.sourceDocumentId, id), eq(healthFollowUps.userId, userId))),
    db.delete(healthDocuments).where(eq(healthDocuments.id, id)),
    db.delete(mediaObjects).where(
      inArray(
        mediaObjects.id,
        media.map((m) => m.id),
      ),
    ),
  ]);
  if (media.length > 0) await bucket.delete(media.map((m) => m.r2Key));
  return true;
}

// ─── 檢驗值 ────────────────────────────────────────────────

export async function addManualLab(db: Db, userId: string, item: LabDraftItem, measuredAt: string) {
  const [row] = await db
    .insert(labObservations)
    .values({ userId, ...toLabObservationValues(item), measuredAt, source: "manual", verifiedByUser: true })
    .returning({ id: labObservations.id });
  return row.id;
}

export async function deleteLab(db: Db, userId: string, id: string) {
  const deleted = await db
    .delete(labObservations)
    .where(and(eq(labObservations.id, id), eq(labObservations.userId, userId)))
    .returning({ id: labObservations.id });
  return deleted.length > 0;
}

/** 檢驗項目的分組 key：OTHER、過敏原、超音波等依名稱區分 */
export function labKey(row: Pick<LabRow, "code" | "displayName">) {
  return isGroupedByName(row.code) ? `${row.code}:${canonicalLabName(row.code, row.displayName)}` : row.code;
}

export async function listLabs(db: Db, userId: string) {
  return db
    .select()
    .from(labObservations)
    .where(eq(labObservations.userId, userId))
    .orderBy(desc(labObservations.measuredAt), desc(labObservations.createdAt));
}

/** 每個項目最新一筆與前一筆 */
export function summarizeLabs(rows: LabRow[]) {
  const byKey = new Map<string, LabRow[]>();
  for (const row of rows) {
    const key = labKey(row);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  return [...byKey.entries()].map(([key, history]) => ({
    key,
    latest: history[0],
    previous: history.find((r) => r.measuredAt !== history[0].measuredAt) ?? null,
    count: history.length,
  }));
}

export async function labHistory(db: Db, userId: string, key: string) {
  const [code] = key.split(":");
  const rows = await db
    .select()
    .from(labObservations)
    .where(and(eq(labObservations.userId, userId), eq(labObservations.code, code)))
    .orderBy(asc(labObservations.measuredAt));
  // 依名稱分組的項目：舊資料的名稱寫法可能不同，用統一名稱比對
  return isGroupedByName(code) ? rows.filter((r) => labKey(r) === key) : rows;
}

// ─── 基本資料 ──────────────────────────────────────────────

export async function getHealthProfile(db: Db, userId: string) {
  const [row] = await db.select().from(healthProfiles).where(eq(healthProfiles.userId, userId)).limit(1);
  return row ?? null;
}

export async function saveHealthProfile(
  db: Db,
  userId: string,
  values: Omit<typeof healthProfiles.$inferInsert, "userId" | "updatedAt">,
) {
  await db
    .insert(healthProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: healthProfiles.userId, set: { ...values, updatedAt: new Date() } });
}

// ─── 健康目標 ──────────────────────────────────────────────

export type GoalRow = typeof healthGoals.$inferSelect;

export async function listGoals(db: Db, userId: string) {
  return db.select().from(healthGoals).where(eq(healthGoals.userId, userId)).orderBy(asc(healthGoals.createdAt));
}

export async function createGoal(
  db: Db,
  userId: string,
  input: { metric: string; unit: string | null; baselineValue: number | null; targetValue: number; targetDate?: string },
) {
  const [row] = await db
    .insert(healthGoals)
    .values({ userId, ...input, direction: goalDirection(input.baselineValue, input.targetValue) })
    .returning({ id: healthGoals.id });
  return row.id;
}

export async function setGoalStatus(db: Db, userId: string, id: string, status: GoalRow["status"]) {
  const updated = await db
    .update(healthGoals)
    .set({ status })
    .where(and(eq(healthGoals.id, id), eq(healthGoals.userId, userId)))
    .returning({ id: healthGoals.id });
  return updated.length > 0;
}

export async function deleteGoal(db: Db, userId: string, id: string) {
  const deleted = await db
    .delete(healthGoals)
    .where(and(eq(healthGoals.id, id), eq(healthGoals.userId, userId)))
    .returning({ id: healthGoals.id });
  return deleted.length > 0;
}

/** 日常量測對應到檢驗代碼（取較新的一筆） */
const OBSERVATION_FOR_METRIC: Record<string, { type: string; key: string }> = {
  WEIGHT: { type: "weight", key: "weight" },
  WAIST: { type: "waist", key: "waist" },
  SBP: { type: "blood_pressure", key: "systolic" },
  DBP: { type: "blood_pressure", key: "diastolic" },
};

function daysAgoLocal(timeZone: string, days: number) {
  return toLocalDate(new Date(Date.now() - days * 86_400_000), timeZone);
}

/** 目標指標的目前值與日期 */
export async function currentMetricValue(
  db: Db,
  user: Pick<SessionUser, "id" | "timezone">,
  metric: string,
): Promise<{ value: number; date: string } | null> {
  const since = daysAgoLocal(user.timezone, 6);

  if (metric === "STEPS_AVG_7D") {
    const rows = await db
      .select({ date: activityDaily.localDate, steps: sql<number>`max(${activityDaily.steps})` })
      .from(activityDaily)
      .where(and(eq(activityDaily.userId, user.id), gte(activityDaily.localDate, since)))
      .groupBy(activityDaily.localDate);
    const values = rows.map((r) => r.steps).filter((v) => v !== null);
    return values.length ? { value: Math.round(values.reduce((a, b) => a + b, 0) / values.length), date: "近 7 天" } : null;
  }
  if (metric === "SLEEP_HOURS_AVG_7D") {
    const rows = await db
      .select()
      .from(sleepSessions)
      .where(and(eq(sleepSessions.userId, user.id), gte(sleepSessions.localDate, since)));
    const minutes = rows.map(sleepDurationMin).filter((m): m is number => m !== null);
    return minutes.length
      ? { value: Math.round((minutes.reduce((a, b) => a + b, 0) / minutes.length / 60) * 10) / 10, date: "近 7 天" }
      : null;
  }
  if (metric === "EXERCISE_MIN_7D") {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${exerciseSessions.durationMin}), 0)` })
      .from(exerciseSessions)
      .where(and(eq(exerciseSessions.userId, user.id), gte(exerciseSessions.localDate, since)));
    return { value: Math.round(row?.total ?? 0), date: "近 7 天" };
  }

  const [lab] = await db
    .select({ value: labObservations.value, date: labObservations.measuredAt })
    .from(labObservations)
    .where(and(eq(labObservations.userId, user.id), eq(labObservations.code, metric)))
    .orderBy(desc(labObservations.measuredAt))
    .limit(1);
  const fromLab = lab?.value != null ? { value: lab.value, date: lab.date } : null;

  const obsDef = OBSERVATION_FOR_METRIC[metric];
  if (!obsDef) return fromLab;
  const [obs] = await db
    .select({ values: observations.values, date: observations.localDate })
    .from(observations)
    .where(and(eq(observations.userId, user.id), eq(observations.type, obsDef.type)))
    .orderBy(desc(observations.occurredAt))
    .limit(1);
  const fromObs = obs ? { value: Number(obs.values[obsDef.key]), date: obs.date } : null;
  if (!fromObs) return fromLab;
  if (!fromLab) return fromObs;
  return fromObs.date >= fromLab.date ? fromObs : fromLab;
}

/** 依健檢報告產生建議目標（已有進行中目標的指標除外） */
export async function goalSuggestions(db: Db, user: Pick<SessionUser, "id" | "timezone">) {
  const [labs, profile, goals] = await Promise.all([listLabs(db, user.id), getHealthProfile(db, user.id), listGoals(db, user.id)]);
  // 每天可以自己量的項目以最新的量測為基準
  const daily = await Promise.all(
    ["WEIGHT", "WAIST", "SBP", "DBP"].map(async (code) => [code, (await currentMetricValue(db, user, code))?.value] as const),
  );
  const latestHeight = labs.find((l) => l.code === "HEIGHT" && l.value !== null)?.value ?? null;
  return suggestGoals({
    labs,
    current: Object.fromEntries(daily),
    profile: { sex: profile?.sex ?? null, heightCm: profile?.heightCm ?? latestHeight },
    activeMetrics: new Set(goals.filter((g) => g.status === "active").map((g) => g.metric)),
    today: toLocalDate(new Date(), user.timezone),
  });
}

/** 近 7 天（含今天）有飲食紀錄的日子平均攝取，供改善建議比對 */
export async function recentIntake(db: Db, user: Pick<SessionUser, "id" | "timezone">) {
  return intakeAverage(db, user.id, daysAgoLocal(user.timezone, 6), toLocalDate(new Date(), user.timezone));
}
