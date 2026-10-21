import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { medicationEvents, medications, medicationSchedules } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import {
  buildChecklist,
  scheduledInstant,
  takenStatus,
  type ScheduleForChecklist,
} from "@/lib/medication/checklist";
import type { MedicationInput, MedicationScheduleInput } from "@/lib/schemas/medication";

export type MedicationWithSchedules = typeof medications.$inferSelect & {
  schedules: (typeof medicationSchedules.$inferSelect)[];
};

export async function listMedications(db: Db, userId: string): Promise<MedicationWithSchedules[]> {
  const meds = await db
    .select()
    .from(medications)
    .where(eq(medications.userId, userId))
    .orderBy(asc(medications.name));
  if (meds.length === 0) return [];

  const schedules = await db
    .select()
    .from(medicationSchedules)
    .where(
      inArray(
        medicationSchedules.medicationId,
        meds.map((m) => m.id),
      ),
    )
    .orderBy(asc(medicationSchedules.localTime));
  return meds.map((m) => ({ ...m, schedules: schedules.filter((s) => s.medicationId === m.id) }));
}

export async function getMedication(db: Db, userId: string, id: string) {
  const [med] = await db
    .select()
    .from(medications)
    .where(and(eq(medications.id, id), eq(medications.userId, userId)))
    .limit(1);
  if (!med) return null;
  const schedules = await db
    .select()
    .from(medicationSchedules)
    .where(eq(medicationSchedules.medicationId, id))
    .orderBy(asc(medicationSchedules.localTime));
  return { ...med, schedules };
}

export async function createMedication(
  db: Db,
  userId: string,
  input: MedicationInput,
  schedules: MedicationScheduleInput[],
) {
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(medications).values({ id, userId, ...input }),
    ...schedules.map((s) => db.insert(medicationSchedules).values({ medicationId: id, ...s })),
  ]);
  return id;
}

/**
 * 更新藥物與排程。排程以時刻比對：時刻不變的保留原 id（已打勾紀錄不受影響），
 * 移除的時刻刪除、新的時刻新增。
 */
export async function updateMedication(
  db: Db,
  userId: string,
  id: string,
  input: MedicationInput,
  schedules: MedicationScheduleInput[],
) {
  const existing = await getMedication(db, userId, id);
  if (!existing) return false;

  const byTime = new Map(existing.schedules.map((s) => [s.localTime, s]));
  const nextTimes = new Set(schedules.map((s) => s.localTime));
  const removed = existing.schedules.filter((s) => !nextTimes.has(s.localTime));

  await db.batch([
    db.update(medications).set(input).where(eq(medications.id, id)),
    ...schedules.map((s) => {
      const kept = byTime.get(s.localTime);
      return kept
        ? db
            .update(medicationSchedules)
            .set({ daysOfWeek: s.daysOfWeek ?? null, dose: s.dose ?? null })
            .where(eq(medicationSchedules.id, kept.id))
        : db.insert(medicationSchedules).values({ medicationId: id, ...s });
    }),
    ...(removed.length > 0
      ? [
          db.delete(medicationSchedules).where(
            inArray(
              medicationSchedules.id,
              removed.map((s) => s.id),
            ),
          ),
        ]
      : []),
  ]);
  return true;
}

export async function setMedicationActive(db: Db, userId: string, id: string, active: boolean) {
  const updated = await db
    .update(medications)
    .set({ active })
    .where(and(eq(medications.id, id), eq(medications.userId, userId)))
    .returning({ id: medications.id });
  return updated.length > 0;
}

/** 刪除藥物會一併刪除排程與服用紀錄 */
export async function deleteMedication(db: Db, userId: string, id: string) {
  const deleted = await db
    .delete(medications)
    .where(and(eq(medications.id, id), eq(medications.userId, userId)))
    .returning({ id: medications.id });
  return deleted.length > 0;
}

export async function getChecklist(db: Db, userId: string, localDate: string) {
  // 不用 db.batch：D1 batch 以欄位名稱回傳結果，join 中的同名欄位（id、dose）會互相覆蓋
  const [scheduleRows, events] = await Promise.all([
    db
      .select({
        scheduleId: medicationSchedules.id,
        medicationId: medications.id,
        name: medications.name,
        dose: medicationSchedules.dose,
        medicationDose: medications.dose,
        unit: medications.unit,
        timing: medications.timing,
        localTime: medicationSchedules.localTime,
        daysOfWeek: medicationSchedules.daysOfWeek,
        startDate: medicationSchedules.startDate,
        endDate: medicationSchedules.endDate,
      })
      .from(medicationSchedules)
      .innerJoin(medications, eq(medicationSchedules.medicationId, medications.id))
      .where(and(eq(medications.userId, userId), eq(medications.active, true))),
    db
      .select({
        id: medicationEvents.id,
        scheduleId: medicationEvents.scheduleId,
        status: medicationEvents.status,
        takenAt: medicationEvents.takenAt,
      })
      .from(medicationEvents)
      .where(and(eq(medicationEvents.userId, userId), eq(medicationEvents.localDate, localDate))),
  ]);

  const schedules: ScheduleForChecklist[] = scheduleRows.map(({ medicationDose, ...s }) => ({
    ...s,
    dose: s.dose ?? medicationDose,
  }));
  return buildChecklist(schedules, events, localDate);
}

/** 打勾或略過某個排程；同一排程同一天只有一筆，重複操作會覆蓋 */
export async function recordMedicationEvent(
  db: Db,
  user: SessionUser,
  input: { scheduleId: string; localDate: string; action: "take" | "skip" },
  now = new Date(),
) {
  const [schedule] = await db
    .select({
      medicationId: medicationSchedules.medicationId,
      localTime: medicationSchedules.localTime,
      dose: medicationSchedules.dose,
      medicationDose: medications.dose,
    })
    .from(medicationSchedules)
    .innerJoin(medications, eq(medicationSchedules.medicationId, medications.id))
    .where(and(eq(medicationSchedules.id, input.scheduleId), eq(medications.userId, user.id)))
    .limit(1);
  if (!schedule) return null;

  const scheduledAt = scheduledInstant(input.localDate, schedule.localTime, user.timezone);
  const values =
    input.action === "take"
      ? {
          status: takenStatus(scheduledAt, now),
          takenAt: now.toISOString(),
          actualDose: schedule.dose ?? schedule.medicationDose,
        }
      : { status: "skipped" as const, takenAt: null, actualDose: null };

  const [row] = await db
    .insert(medicationEvents)
    .values({
      userId: user.id,
      medicationId: schedule.medicationId,
      scheduleId: input.scheduleId,
      scheduledAt: scheduledAt.toISOString(),
      localDate: input.localDate,
      timezone: user.timezone,
      ...values,
    })
    .onConflictDoUpdate({
      target: [medicationEvents.scheduleId, medicationEvents.localDate],
      set: values,
    })
    .returning({ id: medicationEvents.id });
  return row.id;
}

export async function clearMedicationEvent(
  db: Db,
  userId: string,
  scheduleId: string,
  localDate: string,
) {
  const deleted = await db
    .delete(medicationEvents)
    .where(
      and(
        eq(medicationEvents.userId, userId),
        eq(medicationEvents.scheduleId, scheduleId),
        eq(medicationEvents.localDate, localDate),
      ),
    )
    .returning({ id: medicationEvents.id });
  return deleted.length > 0;
}
