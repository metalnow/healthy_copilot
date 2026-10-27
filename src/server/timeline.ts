import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { drinkEvents, foodEvents, foodItems, labObservations, medicationEvents, medications, observations } from "@/db/schema";
import { labDisplayName } from "@/lib/labs/catalog";
import { formatLabValue } from "@/lib/labs/format";
import { formatMl, formatObservation } from "@/lib/format";
import {
  DRINK_TYPE_LABELS,
  EXERCISE_TYPE_LABELS,
  INTENSITY_LABELS,
  MEAL_TYPE_LABELS,
  MEDICATION_STATUS_LABELS,
  OBSERVATION_LABELS,
  SATIETY_LABELS,
  SEVERITY_LABELS,
  SLEEP_QUALITY_LABELS,
  SYMPTOM_LABELS,
} from "@/lib/labels";
import type { ObservationType } from "@/lib/schemas/observation";
import { formatDuration, sleepDurationMin } from "@/lib/sleep";
import { toLocalTime } from "@/lib/time";
import { lifestyleForRange } from "./lifestyle";

export const TIMELINE_CATEGORIES = {
  measurement: "量測",
  food: "飲食",
  medication: "用藥",
  sleep: "睡眠",
  activity: "活動",
  symptom: "症狀",
  lab: "檢驗",
} as const;
export type TimelineCategory = keyof typeof TIMELINE_CATEGORIES;

/** 可刪除的紀錄類型（對應 deleteEntry） */
export const DELETABLE_KINDS = [
  "observation",
  "food_event",
  "drink_event",
  "sleep",
  "activity",
  "exercise",
  "symptom",
  "medication_event",
] as const;
export type DeletableKind = (typeof DELETABLE_KINDS)[number];

export type TimelineItem = {
  key: string;
  category: TimelineCategory;
  deleteKind?: DeletableKind;
  /** 可修改的紀錄：點進去的編輯頁 */
  editHref?: string;
  id: string;
  localDate: string;
  /** 排序用的 UTC 時間；整天的紀錄（步數、檢驗）為 null */
  occurredAt: string | null;
  time: string | null;
  title: string;
  detail: string;
  ai: boolean;
  /** 嚴重症狀等需要強調的紀錄 */
  emphasis?: boolean;
};

const join = (...parts: (string | number | null | undefined | false)[]) => parts.filter(Boolean).join("・");

export async function getTimeline(
  db: Db,
  user: { id: string; timezone: string },
  from: string,
  to: string,
): Promise<TimelineItem[]> {
  const tz = user.timezone;

  const [obs, food, drinks, meds, labs, lifestyle] = await Promise.all([
    db
      .select()
      .from(observations)
      .where(and(eq(observations.userId, user.id), gte(observations.localDate, from), lte(observations.localDate, to)))
      .orderBy(desc(observations.occurredAt)),
    db
      .select()
      .from(foodEvents)
      .where(and(eq(foodEvents.userId, user.id), gte(foodEvents.localDate, from), lte(foodEvents.localDate, to)))
      .orderBy(desc(foodEvents.occurredAt)),
    db
      .select()
      .from(drinkEvents)
      .where(and(eq(drinkEvents.userId, user.id), gte(drinkEvents.localDate, from), lte(drinkEvents.localDate, to))),
    db
      .select({
        id: medicationEvents.id,
        localDate: medicationEvents.localDate,
        status: medicationEvents.status,
        takenAt: medicationEvents.takenAt,
        scheduledAt: medicationEvents.scheduledAt,
        scheduleId: medicationEvents.scheduleId,
        dose: medicationEvents.actualDose,
        unit: medications.unit,
        name: medications.name,
      })
      .from(medicationEvents)
      .innerJoin(medications, eq(medicationEvents.medicationId, medications.id))
      .where(
        and(eq(medicationEvents.userId, user.id), gte(medicationEvents.localDate, from), lte(medicationEvents.localDate, to)),
      ),
    db
      .select()
      .from(labObservations)
      .where(and(eq(labObservations.userId, user.id), gte(labObservations.measuredAt, from), lte(labObservations.measuredAt, to))),
    lifestyleForRange(db, user.id, from, to),
  ]);

  const items =
    food.length > 0
      ? await db
          .select({ foodEventId: foodItems.foodEventId, name: foodItems.name, portion: foodItems.portion, position: foodItems.position })
          .from(foodItems)
          .innerJoin(foodEvents, eq(foodItems.foodEventId, foodEvents.id))
          .where(and(eq(foodEvents.userId, user.id), gte(foodEvents.localDate, from), lte(foodEvents.localDate, to)))
      : [];

  const timed = (occurredAt: string) => ({ occurredAt, time: toLocalTime(occurredAt, tz) });

  const result: TimelineItem[] = [
    ...obs.map((o) => ({
      key: `observation:${o.id}`,
      category: "measurement" as const,
      deleteKind: "observation" as const,
      editHref: `/log/measurement/${o.type}/${o.id}`,
      id: o.id,
      localDate: o.localDate,
      ...timed(o.occurredAt),
      title: OBSERVATION_LABELS[o.type as ObservationType] ?? o.type,
      detail: formatObservation(o.type, o.values),
      ai: o.extractionId !== null,
    })),
    ...food.map((f) => ({
      key: `food:${f.id}`,
      category: "food" as const,
      deleteKind: "food_event" as const,
      editHref: `/log/food/${f.id}`,
      id: f.id,
      localDate: f.localDate,
      ...timed(f.occurredAt),
      title: MEAL_TYPE_LABELS[f.mealType],
      detail: join(
        items
          .filter((i) => i.foodEventId === f.id)
          .sort((a, b) => a.position - b.position)
          .map((i) => (i.portion ? `${i.name} ${i.portion}` : i.name))
          .join("、"),
        f.totalNutrition?.kcal !== undefined &&
          (f.totalNutrition.estimated
            ? `約 ${Math.round(f.totalNutrition.kcal)} kcal（估算）`
            : `${Math.round(f.totalNutrition.kcal)} kcal`),
        f.satiety && `飽足感：${SATIETY_LABELS[f.satiety]}`,
        f.note,
      ),
      ai: f.extractionId !== null,
    })),
    ...drinks.map((d) => ({
      key: `drink:${d.id}`,
      category: "food" as const,
      deleteKind: "drink_event" as const,
      editHref: `/log/drink/${d.id}`,
      id: d.id,
      localDate: d.localDate,
      ...timed(d.occurredAt),
      title: DRINK_TYPE_LABELS[d.drinkType],
      detail: join(
        d.name,
        d.volumeMl && formatMl(d.volumeMl),
        d.nutrition?.kcal !== undefined &&
          (d.nutrition.estimated ? `約 ${Math.round(d.nutrition.kcal)} kcal（估算）` : `${Math.round(d.nutrition.kcal)} kcal`),
        d.caffeineMg && `咖啡因 ${Math.round(d.caffeineMg)} mg`,
        d.alcoholG && `酒精 ${d.alcoholG} g`,
      ),
      ai: d.extractionId !== null,
    })),
    ...meds.map((m) => {
      const at = m.takenAt ?? m.scheduledAt;
      return {
        key: `med:${m.id}`,
        category: "medication" as const,
        // 排程內的打勾在今日頁「復原」；另外記錄的服用可以直接刪除
        ...(m.scheduleId === null && { deleteKind: "medication_event" as const }),
        id: m.id,
        localDate: m.localDate,
        ...(at ? timed(at) : { occurredAt: null, time: null }),
        title: m.name,
        detail: join(
          MEDICATION_STATUS_LABELS[m.status],
          m.status !== "skipped" && m.dose !== null && `${m.dose}${m.unit ? ` ${m.unit}` : ""}`,
        ),
        ai: false,
      };
    }),
    ...lifestyle.sleep.map((s) => ({
      key: `sleep:${s.id}`,
      category: "sleep" as const,
      deleteKind: "sleep" as const,
      editHref: `/log/sleep/${s.id}`,
      id: s.id,
      localDate: s.localDate,
      ...timed(s.wakeAt),
      title: "睡眠",
      detail: join(
        formatDuration(sleepDurationMin(s)),
        (s.sleepStartAt ?? s.bedtimeAt) && `${toLocalTime((s.sleepStartAt ?? s.bedtimeAt)!, tz)} – ${toLocalTime(s.wakeAt, tz)}`,
        s.quality && `品質 ${SLEEP_QUALITY_LABELS[s.quality]}`,
        s.awakenings != null && s.awakenings > 0 && `醒來 ${s.awakenings} 次`,
      ),
      ai: s.source === "screenshot",
    })),
    ...lifestyle.activity.map((a) => ({
      key: `activity:${a.id}`,
      category: "activity" as const,
      deleteKind: "activity" as const,
      editHref: `/log/activity/${a.id}`,
      id: a.id,
      localDate: a.localDate,
      occurredAt: null,
      time: null,
      title: "步數 / 活動",
      detail: join(
        a.steps != null && `${a.steps.toLocaleString("zh-TW")} 步`,
        a.distanceM != null && `${Math.round(a.distanceM / 100) / 10} 公里`,
        a.activeMinutes != null && `活動 ${a.activeMinutes} 分`,
        a.totalKcal != null && `消耗 ${a.totalKcal.toLocaleString("zh-TW")} kcal`,
      ),
      ai: a.source === "screenshot",
    })),
    ...lifestyle.exercise.map((e) => ({
      key: `exercise:${e.id}`,
      category: "activity" as const,
      deleteKind: "exercise" as const,
      editHref: `/log/exercise/${e.id}`,
      id: e.id,
      localDate: e.localDate,
      ...timed(e.occurredAt),
      title: EXERCISE_TYPE_LABELS[e.type],
      detail: join(`${Math.round(e.durationMin)} 分鐘`, e.intensity && INTENSITY_LABELS[e.intensity], e.afterMeal && "飯後", e.rpe && `RPE ${e.rpe}`),
      ai: e.extractionId !== null,
    })),
    ...lifestyle.symptoms.map((s) => ({
      key: `symptom:${s.id}`,
      category: "symptom" as const,
      deleteKind: "symptom" as const,
      editHref: `/log/symptom/${s.id}`,
      id: s.id,
      localDate: s.localDate,
      ...timed(s.occurredAt),
      title: SYMPTOM_LABELS[s.type] ?? s.type,
      detail: join(`嚴重度 ${s.severity}（${SEVERITY_LABELS[s.severity]}）`, s.durationMin && `${s.durationMin} 分鐘`, s.note),
      ai: s.extractionId !== null,
      emphasis: s.severity >= 4,
    })),
    ...labs.map((l) => ({
      key: `lab:${l.id}`,
      category: "lab" as const,
      id: l.id,
      localDate: l.measuredAt,
      occurredAt: null,
      time: null,
      title: labDisplayName(l),
      detail: formatLabValue(l),
      ai: l.source === "ai_extract",
    })),
  ];

  // 日期新到舊；同一天內整天的紀錄在前，其餘依時間新到舊
  return result.sort(
    (a, b) =>
      b.localDate.localeCompare(a.localDate) ||
      (a.occurredAt === null ? -1 : b.occurredAt === null ? 1 : b.occurredAt.localeCompare(a.occurredAt)),
  );
}
