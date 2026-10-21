import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  drinkEvents,
  foodEvents,
  medicationEvents,
  medications,
  medicationSchedules,
  observations,
} from "@/db/schema";
import { summarize, type AggregateInput } from "@/lib/insights/aggregate";
import { isScheduledOn } from "@/lib/medication/checklist";
import { toLocalDate } from "@/lib/time";
import { lifestyleForRange } from "./lifestyle";

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function eachDate(from: string, to: string) {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** 期間內應服用次數：只算啟用中的藥物、且在排程開始（或建立）之後的日期 */
async function medicationCounts(db: Db, user: { id: string; timezone: string }, from: string, to: string) {
  const [schedules, events] = await Promise.all([
    db
      .select({
        scheduleId: medicationSchedules.id,
        medicationId: medications.id,
        name: medications.name,
        dose: medicationSchedules.dose,
        unit: medications.unit,
        timing: medications.timing,
        localTime: medicationSchedules.localTime,
        daysOfWeek: medicationSchedules.daysOfWeek,
        startDate: medicationSchedules.startDate,
        endDate: medicationSchedules.endDate,
        createdAt: medications.createdAt,
      })
      .from(medicationSchedules)
      .innerJoin(medications, eq(medicationSchedules.medicationId, medications.id))
      .where(and(eq(medications.userId, user.id), eq(medications.active, true))),
    db
      .select({ status: medicationEvents.status })
      .from(medicationEvents)
      .where(and(eq(medicationEvents.userId, user.id), gte(medicationEvents.localDate, from), lte(medicationEvents.localDate, to))),
  ]);

  let expected = 0;
  for (const schedule of schedules) {
    const created = toLocalDate(schedule.createdAt, user.timezone);
    for (const date of eachDate(from, to)) {
      if (date >= (schedule.startDate ?? created) && isScheduledOn(schedule, date)) expected++;
    }
  }
  const count = (status: string) => events.filter((e) => e.status === status).length;
  return { expected, taken: count("taken"), late: count("late"), skipped: count("skipped") };
}

export async function loadAggregateInput(
  db: Db,
  user: { id: string; timezone: string },
  from: string,
  to: string,
): Promise<AggregateInput> {
  const [obs, food, drinks, lifestyle, medication] = await Promise.all([
    db
      .select({
        type: observations.type,
        localDate: observations.localDate,
        occurredAt: observations.occurredAt,
        values: observations.values,
      })
      .from(observations)
      .where(and(eq(observations.userId, user.id), gte(observations.localDate, from), lte(observations.localDate, to))),
    db
      .select({
        localDate: foodEvents.localDate,
        occurredAt: foodEvents.occurredAt,
        mealType: foodEvents.mealType,
        totalNutrition: foodEvents.totalNutrition,
      })
      .from(foodEvents)
      .where(and(eq(foodEvents.userId, user.id), gte(foodEvents.localDate, from), lte(foodEvents.localDate, to))),
    db
      .select({
        localDate: drinkEvents.localDate,
        drinkType: drinkEvents.drinkType,
        waterMl: drinkEvents.waterMl,
        caffeineMg: drinkEvents.caffeineMg,
        alcoholG: drinkEvents.alcoholG,
        sugarG: drinkEvents.sugarG,
      })
      .from(drinkEvents)
      .where(and(eq(drinkEvents.userId, user.id), gte(drinkEvents.localDate, from), lte(drinkEvents.localDate, to))),
    lifestyleForRange(db, user.id, from, to),
    medicationCounts(db, user, from, to),
  ]);

  return {
    timeZone: user.timezone,
    from,
    to,
    observations: obs,
    food: food.map((f) => ({ ...f, kcal: f.totalNutrition?.kcal ?? null })),
    drinks,
    sleep: lifestyle.sleep,
    activity: lifestyle.activity,
    exercise: lifestyle.exercise,
    medication,
    symptoms: lifestyle.symptoms,
  };
}

/** 本期與等長的前一期 */
export async function summariesWithPrevious(
  db: Db,
  user: { id: string; timezone: string },
  from: string,
  to: string,
) {
  const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const [currentInput, previousInput] = await Promise.all([
    loadAggregateInput(db, user, from, to),
    loadAggregateInput(db, user, addDays(from, -days), addDays(from, -1)),
  ]);
  return { currentInput, current: summarize(currentInput), previous: summarize(previousInput) };
}
