import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { observations } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import type { ObservationSource } from "@/lib/enums";
import {
  OBSERVATION_TYPES,
  OBSERVATION_UNITS,
  type ObservationType,
} from "@/lib/schemas/observation";
import { eventTimeFields } from "@/lib/time";

export type ObservationRow = typeof observations.$inferSelect;

export async function addObservation(
  db: Db,
  user: SessionUser,
  input: {
    type: ObservationType;
    values: Record<string, number>;
    occurredAt: Date;
    note?: string;
    context?: Record<string, unknown>;
    source?: ObservationSource;
    confidence?: number;
    extractionId?: string;
    mediaId?: string;
  },
) {
  const [row] = await db
    .insert(observations)
    .values({
      userId: user.id,
      type: input.type,
      ...eventTimeFields(input.occurredAt, user.timezone),
      values: input.values,
      unit: OBSERVATION_UNITS[input.type],
      source: input.source ?? "manual",
      confidence: input.confidence,
      extractionId: input.extractionId,
      mediaId: input.mediaId,
      note: input.note,
      context: input.context,
      verifiedByUser: true,
    })
    .returning({ id: observations.id });
  return row.id;
}

/** 各量測類型最近一筆（不限今天） */
export async function latestObservations(db: Db, userId: string) {
  const [first, ...rest] = OBSERVATION_TYPES.map((type) =>
    db
      .select()
      .from(observations)
      .where(and(eq(observations.userId, userId), eq(observations.type, type)))
      .orderBy(desc(observations.occurredAt))
      .limit(1),
  );
  const results = await db.batch([first, ...rest]);
  return Object.fromEntries(
    OBSERVATION_TYPES.map((type, i) => [type, results[i][0] ?? null]),
  ) as Record<ObservationType, ObservationRow | null>;
}

export async function listObservationsForDate(db: Db, userId: string, localDate: string) {
  return db
    .select()
    .from(observations)
    .where(and(eq(observations.userId, userId), eq(observations.localDate, localDate)))
    .orderBy(desc(observations.occurredAt));
}

export async function deleteObservation(db: Db, userId: string, id: string) {
  const deleted = await db
    .delete(observations)
    .where(and(eq(observations.id, id), eq(observations.userId, userId)))
    .returning({ id: observations.id });
  return deleted.length > 0;
}

export async function getObservation(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(observations)
    .where(and(eq(observations.id, id), eq(observations.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** 修改數值、時間與備註；context 只在有傳入時覆寫（保留心率與血壓的關聯） */
export async function updateObservation(
  db: Db,
  user: SessionUser,
  id: string,
  input: { values: Record<string, number>; occurredAt: Date; note?: string; context?: Record<string, unknown> | null },
) {
  const updated = await db
    .update(observations)
    .set({
      values: input.values,
      ...eventTimeFields(input.occurredAt, user.timezone),
      note: input.note ?? null,
      ...(input.context !== undefined && { context: input.context }),
      verifiedByUser: true,
    })
    .where(and(eq(observations.id, id), eq(observations.userId, user.id)))
    .returning({ id: observations.id });
  return updated.length > 0;
}

/** 由血壓的脈搏自動建立的心率紀錄 */
export async function findPulseObservation(db: Db, userId: string, bloodPressureId: string) {
  const [row] = await db
    .select({ id: observations.id })
    .from(observations)
    .where(
      and(
        eq(observations.userId, userId),
        eq(observations.type, "heart_rate"),
        sql`json_extract(${observations.context}, '$.fromBloodPressure') = ${bloodPressureId}`,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}
