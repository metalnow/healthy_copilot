import { describe, expect, it } from "vitest";
import { dailySeries, deterministicInsights, summarize, type AggregateInput } from "./aggregate";

const TZ = "Asia/Taipei";

function input(overrides: Partial<AggregateInput> = {}): AggregateInput {
  return {
    timeZone: TZ,
    from: "2026-10-12",
    to: "2026-10-18",
    observations: [],
    sleep: [],
    activity: [],
    exercise: [],
    food: [],
    drinks: [],
    medication: { expected: 0, taken: 0, late: 0, skipped: 0 },
    symptoms: [],
    ...overrides,
  };
}

const obs = (type: string, localDate: string, hour: number, values: Record<string, number>) => ({
  type,
  localDate,
  occurredAt: `${localDate}T${String(hour - 8).padStart(2, "0")}:00:00.000Z`,
  values,
});

describe("summarize", () => {
  it("體重：每日取最後一筆、計算變化與每週趨勢", () => {
    const s = summarize(
      input({
        observations: [
          obs("weight", "2026-10-12", 9, { weight: 86 }),
          obs("weight", "2026-10-12", 21, { weight: 85.8 }),
          obs("weight", "2026-10-15", 9, { weight: 85.4 }),
          obs("weight", "2026-10-18", 9, { weight: 85.1 }),
        ],
      }),
    );
    expect(s.weight).toMatchObject({ daysLogged: 3, first: 85.8, last: 85.1, change: -0.7 });
    expect(s.weight.trendPerWeek).toBeCloseTo(-0.82, 1);
  });

  it("血壓平均與 ≥140/90 次數", () => {
    const s = summarize(
      input({
        observations: [
          obs("blood_pressure", "2026-10-12", 8, { systolic: 128, diastolic: 82 }),
          obs("blood_pressure", "2026-10-13", 8, { systolic: 142, diastolic: 88 }),
          obs("blood_pressure", "2026-10-14", 8, { systolic: 130, diastolic: 91 }),
        ],
      }),
    );
    expect(s.bloodPressure).toEqual({
      readings: 3,
      avgSystolic: 133,
      avgDiastolic: 87,
      maxSystolic: 142,
      readingsAtOrAbove140_90: 2,
    });
  });

  it("睡眠、步數、運動、飲食、飲料、用藥、症狀", () => {
    const s = summarize(
      input({
        sleep: [
          { localDate: "2026-10-13", totalSleepMin: 380, sleepStartAt: null, bedtimeAt: null, wakeAt: "2026-10-12T23:00:00Z", awakeMin: null, quality: 3 },
          { localDate: "2026-10-14", totalSleepMin: 450, sleepStartAt: null, bedtimeAt: null, wakeAt: "2026-10-13T23:00:00Z", awakeMin: null, quality: 4 },
        ],
        activity: [
          { localDate: "2026-10-12", steps: 6000 },
          { localDate: "2026-10-13", steps: 9000 },
        ],
        exercise: [
          { localDate: "2026-10-12", durationMin: 20, afterMeal: true },
          { localDate: "2026-10-12", durationMin: 15, afterMeal: true },
          { localDate: "2026-10-14", durationMin: 30, afterMeal: false },
        ],
        food: [
          { localDate: "2026-10-12", occurredAt: "2026-10-12T11:00:00Z", mealType: "dinner", kcal: 700, satiety: 5 },
          { localDate: "2026-10-13", occurredAt: "2026-10-13T12:30:00Z", mealType: "dinner", kcal: 900, satiety: 2 },
          { localDate: "2026-10-13", occurredAt: "2026-10-13T04:00:00Z", mealType: "lunch", kcal: null, satiety: null },
        ],
        drinks: [
          { localDate: "2026-10-12", drinkType: "water", waterMl: 500, caffeineMg: null, alcoholG: null, sugarG: null },
          { localDate: "2026-10-12", drinkType: "coffee", waterMl: null, caffeineMg: 150, alcoholG: null, sugarG: null },
          { localDate: "2026-10-13", drinkType: "alcohol", waterMl: null, caffeineMg: null, alcoholG: 19.7, sugarG: null },
        ],
        medication: { expected: 10, taken: 7, late: 1, skipped: 1 },
        symptoms: [
          { localDate: "2026-10-12", type: "headache", severity: 2 },
          { localDate: "2026-10-13", type: "headache", severity: 4 },
        ],
      }),
    );
    expect(s.sleep).toEqual({ nights: 2, avgHours: 6.9, nightsUnder7h: 1, avgQuality: 3.5 });
    expect(s.activity).toEqual({
      daysLogged: 2,
      avgSteps: 7500,
      daysAtStepGoal: 1,
      exerciseSessions: 3,
      exerciseMinutes: 65,
      afterMealExerciseDays: 1,
    });
    // 晚餐 19:00 與 20:30（台北）→ 平均 19:45，一次晚於 20:00
    expect(s.food).toEqual({ mealsLogged: 3, daysLogged: 2, avgEstimatedKcalPerDay: 800, avgDinnerTime: "19:45", lateDinners: 1, satietyLogged: 2, avgSatiety: 3.5, highKcalLowSatiety: 1, lowKcalHighSatiety: 0 });
    expect(s.drinks).toMatchObject({ caffeineMgTotal: 150, alcoholGTotal: 19.7, alcoholDays: 1 });
    expect(s.medication.adherencePercent).toBe(80);
    expect(s.symptoms).toEqual({ count: 2, byType: { headache: 2 }, severeCount: 1 });
  });

  it("沒有資料時各項為 null 或 0", () => {
    const s = summarize(input());
    expect(s.period.days).toBe(7);
    expect(s.weight.change).toBeNull();
    expect(s.sleep.avgHours).toBeNull();
    expect(s.medication.adherencePercent).toBeNull();
  });
});

describe("dailySeries", () => {
  it("血壓每日平均、排序", () => {
    const series = dailySeries(
      input({
        observations: [
          obs("blood_pressure", "2026-10-14", 8, { systolic: 130, diastolic: 80 }),
          obs("blood_pressure", "2026-10-13", 8, { systolic: 120, diastolic: 80 }),
          obs("blood_pressure", "2026-10-13", 20, { systolic: 125, diastolic: 85 }),
        ],
      }),
    );
    expect(series.systolic).toEqual([
      { date: "2026-10-13", value: 122.5 },
      { date: "2026-10-14", value: 130 },
    ]);
  });
});

describe("deterministicInsights", () => {
  it("依優先順序最多 3 則", () => {
    const current = summarize(
      input({
        observations: [obs("blood_pressure", "2026-10-13", 8, { systolic: 145, diastolic: 92 })],
        exercise: [{ localDate: "2026-10-12", durationMin: 15, afterMeal: true }],
        food: [{ localDate: "2026-10-13", occurredAt: "2026-10-13T12:30:00Z", mealType: "dinner", kcal: null, satiety: null }],
      }),
    );
    const previous = summarize(
      input({ food: [{ localDate: "2026-10-06", occurredAt: "2026-10-06T11:48:00Z", mealType: "dinner", kcal: null, satiety: null }] }),
    );
    const insights = deterministicInsights(current, previous, [360, 400, 380]);
    expect(insights.map((i) => i.id)).toEqual(["bp_high_readings", "sleep_short", "dinner_shift"]);
    expect(insights[2].text).toBe("晚餐平均時間比前一期晚 42 分鐘（20:30）");
  });

  it("比較熱量與飽足感", () => {
    const meal = (day: number, kcal: number, satiety: number) => ({
      localDate: `2026-10-1${day}`,
      occurredAt: `2026-10-1${day}T04:00:00Z`,
      mealType: "lunch",
      kcal,
      satiety,
    });
    const current = summarize(input({ food: [meal(2, 850, 2), meal(3, 350, 4), meal(4, 300, 5), meal(5, 600, 3)] }));
    expect(current.food).toMatchObject({ satietyLogged: 4, avgSatiety: 3.5, highKcalLowSatiety: 1, lowKcalHighSatiety: 2 });
    expect(deterministicInsights(current, null, []).map((i) => i.id)).toEqual(["kcal_not_filling", "light_but_filling"]);
  });

  it("資料不足時不產生", () => {
    expect(deterministicInsights(summarize(input()), null, [])).toEqual([]);
  });
});
