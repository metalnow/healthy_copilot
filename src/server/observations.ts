import "server-only";
import { and, desc, eq } from "drizzle-orm";
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
