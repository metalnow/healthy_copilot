import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activityDaily, exerciseSessions, sleepSessions, symptomEvents } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import type { EXERCISE_TYPES, INTENSITIES, ObservationSource } from "@/lib/enums";
import { minutesBetween } from "@/lib/sleep";
import { eventTimeFields, toLocalDate } from "@/lib/time";

export type SleepRow = typeof sleepSessions.$inferSelect;
export type ActivityRow = typeof activityDaily.$inferSelect;
export type ExerciseRow = typeof exerciseSessions.$inferSelect;
export type SymptomRow = typeof symptomEvents.$inferSelect;

// ─── 睡眠 ──────────────────────────────────────────────────

type SleepInput = {
  bedtimeAt?: Date;
  sleepStartAt?: Date;
  wakeAt: Date;
  awakenings?: number;
  quality?: number;
  totalSleepMin?: number;
  awakeMin?: number;
  deepMin?: number;
  remMin?: number;
  lightMin?: number;
  avgHeartRate?: number;
  hrvMs?: number;
};

/** 睡眠的時間與數值欄位；沒有總睡眠時由入睡（或上床）到起床推算 */
function sleepValues(user: SessionUser, input: SleepInput) {
  const span = minutesBetween(input.sleepStartAt ?? input.bedtimeAt, input.wakeAt);
  return {
    bedtimeAt: input.bedtimeAt?.toISOString() ?? null,
    sleepStartAt: input.sleepStartAt?.toISOString() ?? null,
    wakeAt: input.wakeAt.toISOString(),
    // 依起床日期歸日
    localDate: toLocalDate(input.wakeAt, user.timezone),
    timezone: user.timezone,
    awakenings: input.awakenings ?? null,
    quality: input.quality ?? null,
    totalSleepMin: input.totalSleepMin ?? (span === null ? null : Math.max(0, span - (input.awakeMin ?? 0))),
    awakeMin: input.awakeMin ?? null,
    deepMin: input.deepMin ?? null,
    remMin: input.remMin ?? null,
    lightMin: input.lightMin ?? null,
    avgHeartRate: input.avgHeartRate ?? null,
    hrvMs: input.hrvMs ?? null,
  };
}

export async function addSleep(
  db: Db,
  user: SessionUser,
  input: SleepInput & {
    source: ObservationSource;
    confidence?: number;
    originalImageId?: string;
    extractionId?: string;
  },
) {
  const [row] = await db
    .insert(sleepSessions)
    .values({
      userId: user.id,
      ...sleepValues(user, input),
      source: input.source,
      confidence: input.confidence,
      originalImageId: input.originalImageId,
      extractionId: input.extractionId,
      verifiedByUser: true,
    })
    .returning({ id: sleepSessions.id });
  return row.id;
}

/** 修改睡眠；保留來源與截圖資訊 */
export async function updateSleep(db: Db, user: SessionUser, id: string, input: SleepInput) {
  const updated = await db
    .update(sleepSessions)
    .set({ ...sleepValues(user, input), verifiedByUser: true })
    .where(and(eq(sleepSessions.id, id), eq(sleepSessions.userId, user.id)))
    .returning({ id: sleepSessions.id });
  return updated.length > 0;
}

// ─── 步數 / 活動 ───────────────────────────────────────────

/** 同一天、同一來源只保留一筆（手動輸入覆蓋當天的值） */
export async function upsertActivity(
  db: Db,
  userId: string,
  input: { localDate: string; steps?: number; distanceM?: number; activeMinutes?: number; source: ObservationSource },
) {
  const values = {
    steps: input.steps ?? null,
    distanceM: input.distanceM ?? null,
    activeMinutes: input.activeMinutes ?? null,
  };
  const [row] = await db
    .insert(activityDaily)
    .values({ userId, localDate: input.localDate, source: input.source, ...values })
    .onConflictDoUpdate({
      target: [activityDaily.userId, activityDaily.localDate, activityDaily.source],
      set: { ...values, updatedAt: new Date() },
    })
    .returning({ id: activityDaily.id });
  return row.id;
}

/** 修改某天的活動量（日期不變，避免與當天其他紀錄衝突） */
export async function updateActivity(
  db: Db,
  userId: string,
  id: string,
  input: { steps?: number; distanceM?: number; activeMinutes?: number },
) {
  const updated = await db
    .update(activityDaily)
    .set({ steps: input.steps ?? null, distanceM: input.distanceM ?? null, activeMinutes: input.activeMinutes ?? null })
    .where(and(eq(activityDaily.id, id), eq(activityDaily.userId, userId)))
    .returning({ id: activityDaily.id });
  return updated.length > 0;
}

// ─── 運動 ──────────────────────────────────────────────────

export async function addExercise(
  db: Db,
  user: SessionUser,
  input: {
    type: (typeof EXERCISE_TYPES)[number];
    startedAt: Date;
    durationMin: number;
    intensity?: (typeof INTENSITIES)[number];
    rpe?: number;
    afterMeal?: boolean;
    note?: string;
    source?: ObservationSource;
    confidence?: number;
    extractionId?: string;
  },
) {
  const time = eventTimeFields(input.startedAt, user.timezone);
  const [row] = await db
    .insert(exerciseSessions)
    .values({
      userId: user.id,
      type: input.type,
      occurredAt: time.occurredAt,
      localDate: time.localDate,
      timezone: time.timezone,
      durationMin: input.durationMin,
      intensity: input.intensity,
      rpe: input.rpe,
      afterMeal: input.afterMeal,
      note: input.note,
      source: input.source ?? "manual",
      confidence: input.confidence,
      extractionId: input.extractionId,
    })
    .returning({ id: exerciseSessions.id });
  return row.id;
}

export async function updateExercise(
  db: Db,
  user: SessionUser,
  id: string,
  input: {
    type: (typeof EXERCISE_TYPES)[number];
    startedAt: Date;
    durationMin: number;
    intensity?: (typeof INTENSITIES)[number];
    rpe?: number;
    afterMeal?: boolean;
    note?: string;
  },
) {
  const updated = await db
    .update(exerciseSessions)
    .set({
      type: input.type,
      ...eventTimeFields(input.startedAt, user.timezone),
      durationMin: input.durationMin,
      intensity: input.intensity ?? null,
      rpe: input.rpe ?? null,
      afterMeal: input.afterMeal ?? null,
      note: input.note ?? null,
    })
    .where(and(eq(exerciseSessions.id, id), eq(exerciseSessions.userId, user.id)))
    .returning({ id: exerciseSessions.id });
  return updated.length > 0;
}

// ─── 症狀 / 事件 ───────────────────────────────────────────

export async function addSymptom(
  db: Db,
  user: SessionUser,
  input: {
    type: string;
    occurredAt: Date;
    severity: number;
    durationMin?: number;
    note?: string;
    relatedFoodEventIds?: string[];
    source?: ObservationSource;
    confidence?: number;
    extractionId?: string;
  },
) {
  const [row] = await db
    .insert(symptomEvents)
    .values({
      userId: user.id,
      type: input.type,
      ...eventTimeFields(input.occurredAt, user.timezone),
      severity: input.severity,
      durationMin: input.durationMin,
      note: input.note,
      relatedFoodEventIds: input.relatedFoodEventIds?.length ? input.relatedFoodEventIds : undefined,
      source: input.source ?? "manual",
      confidence: input.confidence,
      extractionId: input.extractionId,
    })
    .returning({ id: symptomEvents.id });
  return row.id;
}

export async function updateSymptom(
  db: Db,
  user: SessionUser,
  id: string,
  input: {
    type: string;
    occurredAt: Date;
    severity: number;
    durationMin?: number;
    note?: string;
    relatedFoodEventIds?: string[];
  },
) {
  const updated = await db
    .update(symptomEvents)
    .set({
      type: input.type,
      ...eventTimeFields(input.occurredAt, user.timezone),
      severity: input.severity,
      durationMin: input.durationMin ?? null,
      note: input.note ?? null,
      relatedFoodEventIds: input.relatedFoodEventIds?.length ? input.relatedFoodEventIds : null,
    })
    .where(and(eq(symptomEvents.id, id), eq(symptomEvents.userId, user.id)))
    .returning({ id: symptomEvents.id });
  return updated.length > 0;
}

/** 最近 24 小時的症狀（給「今日」頁的危險訊號判斷） */
export async function recentSymptoms(db: Db, userId: string, hours = 24) {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  return db
    .select()
    .from(symptomEvents)
    .where(and(eq(symptomEvents.userId, userId), gte(symptomEvents.occurredAt, since)))
    .orderBy(desc(symptomEvents.occurredAt));
}

// ─── 區間查詢 ──────────────────────────────────────────────

export async function lifestyleForRange(db: Db, userId: string, from: string, to: string) {
  const [sleep, activity, exercise, symptoms] = await Promise.all([
    db
      .select()
      .from(sleepSessions)
      .where(and(eq(sleepSessions.userId, userId), gte(sleepSessions.localDate, from), lte(sleepSessions.localDate, to)))
      .orderBy(desc(sleepSessions.wakeAt)),
    db
      .select()
      .from(activityDaily)
      .where(and(eq(activityDaily.userId, userId), gte(activityDaily.localDate, from), lte(activityDaily.localDate, to)))
      .orderBy(desc(activityDaily.localDate)),
    db
      .select()
      .from(exerciseSessions)
      .where(
        and(eq(exerciseSessions.userId, userId), gte(exerciseSessions.localDate, from), lte(exerciseSessions.localDate, to)),
      )
      .orderBy(desc(exerciseSessions.occurredAt)),
    db
      .select()
      .from(symptomEvents)
      .where(and(eq(symptomEvents.userId, userId), gte(symptomEvents.localDate, from), lte(symptomEvents.localDate, to)))
      .orderBy(desc(symptomEvents.occurredAt)),
  ]);
  return { sleep, activity, exercise, symptoms };
}

const TABLES = {
  sleep: sleepSessions,
  activity: activityDaily,
  exercise: exerciseSessions,
  symptom: symptomEvents,
} as const;

export async function deleteLifestyleEntry(db: Db, userId: string, kind: keyof typeof TABLES, id: string) {
  const table = TABLES[kind];
  const deleted = await db
    .delete(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .returning({ id: table.id });
  return deleted.length > 0;
}

/** 取得單筆生活紀錄（限本人），供修改頁使用 */
export async function getSleep(db: Db, userId: string, id: string) {
  const [row] = await db.select().from(sleepSessions).where(and(eq(sleepSessions.id, id), eq(sleepSessions.userId, userId))).limit(1);
  return row ?? null;
}

export async function getActivity(db: Db, userId: string, id: string) {
  const [row] = await db.select().from(activityDaily).where(and(eq(activityDaily.id, id), eq(activityDaily.userId, userId))).limit(1);
  return row ?? null;
}

export async function getExercise(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(exerciseSessions)
    .where(and(eq(exerciseSessions.id, id), eq(exerciseSessions.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getSymptom(db: Db, userId: string, id: string) {
  const [row] = await db.select().from(symptomEvents).where(and(eq(symptomEvents.id, id), eq(symptomEvents.userId, userId))).limit(1);
  return row ?? null;
}
