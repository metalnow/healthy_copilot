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

export async function addSleep(
  db: Db,
  user: SessionUser,
  input: {
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
      ...input,
      bedtimeAt: input.bedtimeAt?.toISOString(),
      sleepStartAt: input.sleepStartAt?.toISOString(),
      wakeAt: input.wakeAt.toISOString(),
      // 依起床日期歸日
      localDate: toLocalDate(input.wakeAt, user.timezone),
      timezone: user.timezone,
      totalSleepMin:
        input.totalSleepMin ??
        (() => {
          const span = minutesBetween(input.sleepStartAt ?? input.bedtimeAt, input.wakeAt);
          return span === null ? undefined : Math.max(0, span - (input.awakeMin ?? 0));
        })(),
      verifiedByUser: true,
    })
    .returning({ id: sleepSessions.id });
  return row.id;
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
