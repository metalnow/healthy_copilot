// 彙總服務（純函式）：把一段期間的原始紀錄整理成摘要與每日序列。
// 推理模型只讀這裡的輸出，不直接讀 raw event。

import { sleepDurationMin } from "@/lib/sleep";
import { toLocalTime } from "@/lib/time";

export const STEP_GOAL = 8000;
export const SLEEP_TARGET_MIN = 7 * 60;
const LATE_DINNER = "20:00";
/** 熱量與飽足感落差的門檻：熱量高卻不飽、熱量低卻很飽 */
export const HIGH_KCAL_MEAL = 700;
export const LOW_KCAL_MEAL = 400;

export type AggregateInput = {
  timeZone: string;
  from: string;
  to: string;
  observations: { type: string; localDate: string; occurredAt: string; values: Record<string, number | string> }[];
  sleep: {
    localDate: string;
    totalSleepMin: number | null;
    sleepStartAt: string | null;
    bedtimeAt: string | null;
    wakeAt: string;
    awakeMin: number | null;
    quality: number | null;
  }[];
  activity: { localDate: string; steps: number | null }[];
  exercise: { localDate: string; durationMin: number; afterMeal: boolean | null }[];
  food: { localDate: string; occurredAt: string; mealType: string; kcal: number | null; satiety: number | null }[];
  drinks: {
    localDate: string;
    drinkType: string;
    waterMl: number | null;
    caffeineMg: number | null;
    alcoholG: number | null;
    sugarG: number | null;
  }[];
  medication: { expected: number; taken: number; late: number; skipped: number };
  symptoms: { localDate: string; type: string; severity: number }[];
};

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const num = (v: number | string | undefined) => (v === undefined ? NaN : Number(v));

function byDate<T extends { localDate: string }>(rows: T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) map.set(row.localDate, [...(map.get(row.localDate) ?? []), row]);
  return map;
}

function minutesOfDay(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutesOfDay(minutes: number) {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 最小平方法斜率（每天的變化量） */
function slopePerDay(points: { day: number; value: number }[]) {
  if (points.length < 2) return null;
  const mx = avg(points.map((p) => p.day))!;
  const my = avg(points.map((p) => p.value))!;
  const den = points.reduce((s, p) => s + (p.day - mx) ** 2, 0);
  return den === 0 ? null : points.reduce((s, p) => s + (p.day - mx) * (p.value - my), 0) / den;
}

const dayIndex = (date: string) => Math.round(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);

export type DailySeries = {
  weight: { date: string; value: number }[];
  systolic: { date: string; value: number }[];
  diastolic: { date: string; value: number }[];
  heartRate: { date: string; value: number }[];
  sleepHours: { date: string; value: number }[];
  steps: { date: string; value: number }[];
};

export function dailySeries(input: AggregateInput): DailySeries {
  const obsBy = (type: string) => byDate(input.observations.filter((o) => o.type === type));
  const daily = (map: Map<string, AggregateInput["observations"]>, pick: (rows: AggregateInput["observations"]) => number | null) =>
    [...map.entries()]
      .map(([date, rows]) => ({ date, value: pick(rows) }))
      .filter((p): p is { date: string; value: number } => p.value !== null && Number.isFinite(p.value))
      .sort((a, b) => a.date.localeCompare(b.date));

  // 體重取當天最後一筆，其他取平均
  const latestOf = (key: string) => (rows: AggregateInput["observations"]) =>
    num([...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]?.values[key]);
  const meanOf = (key: string) => (rows: AggregateInput["observations"]) => {
    const value = avg(rows.map((r) => num(r.values[key])).filter(Number.isFinite));
    return value === null ? null : round(value);
  };

  const bp = obsBy("blood_pressure");
  return {
    weight: daily(obsBy("weight"), latestOf("weight")),
    systolic: daily(bp, meanOf("systolic")),
    diastolic: daily(bp, meanOf("diastolic")),
    heartRate: daily(obsBy("heart_rate"), meanOf("bpm")),
    sleepHours: [...byDate(input.sleep).entries()]
      .map(([date, rows]) => {
        const total = rows.map(sleepDurationMin).filter((m): m is number => m !== null);
        return { date, value: total.length ? round(total.reduce((a, b) => a + b, 0) / 60) : null };
      })
      .filter((p): p is { date: string; value: number } => p.value !== null)
      .sort((a, b) => a.date.localeCompare(b.date)),
    steps: [...byDate(input.activity).entries()]
      .map(([date, rows]) => ({ date, value: Math.max(...rows.map((r) => r.steps ?? 0)) }))
      .filter((p) => p.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export type PeriodSummary = ReturnType<typeof summarize>;

export function summarize(input: AggregateInput) {
  const series = dailySeries(input);
  const days = dayIndex(input.to) - dayIndex(input.from) + 1;

  const weights = series.weight;
  const weightSlope = slopePerDay(weights.map((p) => ({ day: dayIndex(p.date), value: p.value })));
  const bpReadings = input.observations.filter((o) => o.type === "blood_pressure");
  const sys = bpReadings.map((o) => num(o.values.systolic)).filter(Number.isFinite);
  const dia = bpReadings.map((o) => num(o.values.diastolic)).filter(Number.isFinite);
  const hr = input.observations.filter((o) => o.type === "heart_rate").map((o) => num(o.values.bpm)).filter(Number.isFinite);
  const waist = input.observations.filter((o) => o.type === "waist").sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const sleepMinutes = input.sleep.map(sleepDurationMin).filter((m): m is number => m !== null);
  const qualities = input.sleep.map((s) => s.quality).filter((q): q is number => q !== null);

  const steps = series.steps.map((p) => p.value);

  const dinners = input.food.filter((f) => f.mealType === "dinner");
  const dinnerTimes = dinners.map((f) => minutesOfDay(toLocalTime(f.occurredAt, input.timeZone)));
  const kcalByDay = [...byDate(input.food.filter((f) => f.kcal !== null)).entries()].map(([, rows]) =>
    rows.reduce((s, r) => s + (r.kcal ?? 0), 0),
  );

  const satietyMeals = input.food.filter((f): f is typeof f & { satiety: number } => f.satiety !== null);

  const waterByDay = [...byDate(input.drinks).values()].map((rows) => rows.reduce((s, r) => s + (r.waterMl ?? 0), 0));
  const alcoholDays = [...byDate(input.drinks.filter((d) => (d.alcoholG ?? 0) > 0)).keys()];

  const symptomCounts: Record<string, number> = {};
  for (const s of input.symptoms) symptomCounts[s.type] = (symptomCounts[s.type] ?? 0) + 1;

  const done = input.medication.taken + input.medication.late;

  return {
    period: { from: input.from, to: input.to, days },
    weight: {
      daysLogged: weights.length,
      first: weights[0]?.value ?? null,
      last: weights.at(-1)?.value ?? null,
      change: weights.length >= 2 ? round(weights.at(-1)!.value - weights[0].value) : null,
      trendPerWeek: weightSlope === null ? null : round(weightSlope * 7, 2),
    },
    waist: {
      last: waist.length ? num(waist.at(-1)!.values.waist) : null,
      change: waist.length >= 2 ? round(num(waist.at(-1)!.values.waist) - num(waist[0].values.waist)) : null,
    },
    bloodPressure: {
      readings: bpReadings.length,
      avgSystolic: sys.length ? Math.round(avg(sys)!) : null,
      avgDiastolic: dia.length ? Math.round(avg(dia)!) : null,
      maxSystolic: sys.length ? Math.max(...sys) : null,
      readingsAtOrAbove140_90: bpReadings.filter((o) => num(o.values.systolic) >= 140 || num(o.values.diastolic) >= 90).length,
    },
    heartRate: { readings: hr.length, avg: hr.length ? Math.round(avg(hr)!) : null },
    sleep: {
      nights: sleepMinutes.length,
      avgHours: sleepMinutes.length ? round(avg(sleepMinutes)! / 60) : null,
      nightsUnder7h: sleepMinutes.filter((m) => m < SLEEP_TARGET_MIN).length,
      avgQuality: qualities.length ? round(avg(qualities)!) : null,
    },
    activity: {
      daysLogged: steps.length,
      avgSteps: steps.length ? Math.round(avg(steps)!) : null,
      daysAtStepGoal: steps.filter((s) => s >= STEP_GOAL).length,
      exerciseSessions: input.exercise.length,
      exerciseMinutes: Math.round(input.exercise.reduce((s, e) => s + e.durationMin, 0)),
      afterMealExerciseDays: new Set(input.exercise.filter((e) => e.afterMeal).map((e) => e.localDate)).size,
    },
    food: {
      mealsLogged: input.food.length,
      daysLogged: byDate(input.food).size,
      avgEstimatedKcalPerDay: kcalByDay.length ? Math.round(avg(kcalByDay)!) : null,
      avgDinnerTime: dinnerTimes.length ? formatMinutesOfDay(avg(dinnerTimes)!) : null,
      lateDinners: dinnerTimes.filter((m) => m >= minutesOfDay(LATE_DINNER)).length,
      // 主觀飽足感 1–5，與熱量估算對照
      satietyLogged: satietyMeals.length,
      avgSatiety: satietyMeals.length ? round(avg(satietyMeals.map((f) => f.satiety))!) : null,
      highKcalLowSatiety: satietyMeals.filter((f) => f.kcal !== null && f.kcal >= HIGH_KCAL_MEAL && f.satiety <= 2).length,
      lowKcalHighSatiety: satietyMeals.filter((f) => f.kcal !== null && f.kcal <= LOW_KCAL_MEAL && f.satiety >= 4).length,
    },
    drinks: {
      avgWaterMlPerDay: waterByDay.length ? Math.round(avg(waterByDay)!) : null,
      caffeineMgTotal: Math.round(input.drinks.reduce((s, d) => s + (d.caffeineMg ?? 0), 0)),
      alcoholGTotal: round(input.drinks.reduce((s, d) => s + (d.alcoholG ?? 0), 0)),
      alcoholDays: alcoholDays.length,
      sugaryDrinks: input.drinks.filter((d) => d.drinkType === "sugary").length,
    },
    medication: {
      ...input.medication,
      adherencePercent: input.medication.expected ? Math.round((done / input.medication.expected) * 100) : null,
    },
    symptoms: {
      count: input.symptoms.length,
      byType: symptomCounts,
      severeCount: input.symptoms.filter((s) => s.severity >= 4).length,
    },
  };
}

export type Insight = { id: string; text: string; tone: "positive" | "neutral" | "attention" };

/**
 * 固定規則產生的觀察（最多 3 則）：只陳述資料，不做因果推論。
 * current / previous 為本期與上一期（等長）的摘要；recentSleepMin 為最近幾晚的睡眠分鐘數（新到舊）。
 */
export function deterministicInsights(
  current: PeriodSummary,
  previous: PeriodSummary | null,
  recentSleepMin: number[],
  limit = 3,
): Insight[] {
  const insights: (Insight & { priority: number })[] = [];

  const lastThree = recentSleepMin.slice(0, 3);
  if (lastThree.length >= 2 && avg(lastThree)! < SLEEP_TARGET_MIN) {
    const hours = round(avg(lastThree)! / 60);
    insights.push({ id: "sleep_short", priority: 2, tone: "attention", text: `最近 ${lastThree.length} 晚平均睡眠 ${hours} 小時，低於 7 小時` });
  }

  if (current.bloodPressure.readingsAtOrAbove140_90 > 0) {
    insights.push({
      id: "bp_high_readings",
      priority: 1,
      tone: "attention",
      text: `本期有 ${current.bloodPressure.readingsAtOrAbove140_90} 次血壓 ≥ 140/90（平均 ${current.bloodPressure.avgSystolic}/${current.bloodPressure.avgDiastolic}）`,
    });
  }

  const prevDinner = previous?.food.avgDinnerTime;
  const curDinner = current.food.avgDinnerTime;
  if (prevDinner && curDinner) {
    const diff = minutesOfDay(curDinner) - minutesOfDay(prevDinner);
    if (Math.abs(diff) >= 20) {
      insights.push({
        id: "dinner_shift",
        priority: 4,
        tone: diff > 0 ? "attention" : "positive",
        text: `晚餐平均時間比前一期${diff > 0 ? "晚" : "早"} ${Math.abs(Math.round(diff))} 分鐘（${curDinner}）`,
      });
    }
  }

  if (current.activity.afterMealExerciseDays > 0) {
    insights.push({
      id: "after_meal_exercise",
      priority: 5,
      tone: "positive",
      text: `本期已有 ${current.activity.afterMealExerciseDays} 天完成飯後運動`,
    });
  }

  if (current.weight.change !== null && current.weight.daysLogged >= 3 && Math.abs(current.weight.change) >= 0.3) {
    insights.push({
      id: "weight_change",
      priority: 6,
      tone: "neutral",
      text: `體重 ${current.weight.first} → ${current.weight.last} kg（${current.weight.change > 0 ? "+" : ""}${current.weight.change} kg）`,
    });
  }

  if (current.medication.adherencePercent !== null && current.medication.expected >= 3 && current.medication.adherencePercent < 80) {
    insights.push({
      id: "med_adherence",
      priority: 3,
      tone: "attention",
      text: `用藥完成率 ${current.medication.adherencePercent}%`,
    });
  }

  if (current.activity.avgSteps !== null && current.activity.daysLogged >= 3) {
    const prev = previous?.activity.avgSteps;
    const change = prev ? current.activity.avgSteps - prev : null;
    insights.push({
      id: "steps",
      priority: 7,
      tone: current.activity.avgSteps >= STEP_GOAL ? "positive" : "neutral",
      text: `平均每天 ${current.activity.avgSteps.toLocaleString("zh-TW")} 步${change ? `（比前一期${change > 0 ? "多" : "少"} ${Math.abs(change).toLocaleString("zh-TW")} 步）` : ""}`,
    });
  }

  if (current.food.highKcalLowSatiety > 0) {
    insights.push({
      id: "kcal_not_filling",
      priority: 5,
      tone: "attention",
      text: `本期有 ${current.food.highKcalLowSatiety} 餐熱量估算 ≥ ${HIGH_KCAL_MEAL} kcal，吃完卻還覺得餓`,
    });
  }

  if (current.food.lowKcalHighSatiety >= 2) {
    insights.push({
      id: "light_but_filling",
      priority: 6,
      tone: "positive",
      text: `有 ${current.food.lowKcalHighSatiety} 餐熱量 ≤ ${LOW_KCAL_MEAL} kcal 卻很飽，可以多參考這些餐點`,
    });
  }

  if (current.drinks.alcoholDays >= 3) {
    insights.push({ id: "alcohol_days", priority: 4, tone: "attention", text: `本期有 ${current.drinks.alcoholDays} 天飲酒` });
  }

  return insights
    .sort((a, b) => a.priority - b.priority)
    .slice(0, limit)
    .map(({ id, text, tone }) => ({ id, text, tone }));
}
