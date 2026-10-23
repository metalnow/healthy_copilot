import { describe, expect, it } from "vitest";
import {
  ConfirmDraftSchema,
  draftFromFoodPhoto,
  draftFromTextParse,
  resolveOccurredAt,
  sumNutrition,
} from "./draft";
import type { AiDrinkItem, AiEvent, AiFoodItem } from "./schemas";

const TZ = "Asia/Taipei";
const now = new Date("2026-10-21T08:00:00Z"); // 台北 16:00

const nullNutrition = { kcal: null, proteinG: null, fatG: null, carbG: null, fiberG: null, sugarG: null, sodiumMg: null };

const item = (name: string, kcal: number | null = null): AiFoodItem => ({
  name,
  portion: "1 份",
  confidence: 0.9,
  nutrition: { ...nullNutrition, kcal },
});

const baseEvent: AiEvent = {
  kind: "food",
  dayOffset: 0,
  localTime: null,
  confidence: 0.8,
  mealType: null,
  items: [],
  drinkType: null,
  drinkName: null,
  volumeMl: null,
  caffeineMg: null,
  sugarG: null,
  alcoholG: null,
  drinkKcal: null,
  measurementType: null,
  weightKg: null,
  systolic: null,
  diastolic: null,
  pulse: null,
  bpm: null,
  waistCm: null,
  exerciseType: null,
  durationMin: null,
  intensity: null,
  afterMeal: false,
  symptomType: null,
  severity: null,
  note: null,
};

describe("resolveOccurredAt", () => {
  it("今天指定時刻", () => {
    expect(resolveOccurredAt({ dayOffset: 0, localTime: "15:00" }, now, TZ)).toBe("2026-10-21T15:00");
  });
  it("沒有時刻時用現在", () => {
    expect(resolveOccurredAt({ dayOffset: 0, localTime: null }, now, TZ)).toBe("2026-10-21T16:00");
  });
  it("昨天沒有時刻時用餐別預設時間", () => {
    expect(resolveOccurredAt({ dayOffset: -1, localTime: null, mealType: "dinner" }, now, TZ)).toBe(
      "2026-10-20T18:30",
    );
  });
  it("不可晚於現在、不接受未來日期", () => {
    expect(resolveOccurredAt({ dayOffset: 0, localTime: "20:00" }, now, TZ)).toBe("2026-10-21T16:00");
    expect(resolveOccurredAt({ dayOffset: 2, localTime: "09:00" }, now, TZ)).toBe("2026-10-21T09:00");
  });
  it("格式錯誤的時刻視同未提供", () => {
    expect(resolveOccurredAt({ dayOffset: 0, localTime: "3pm" }, now, TZ)).toBe("2026-10-21T16:00");
  });
});

describe("draftFromTextParse", () => {
  it("規格範例：三點喝大杯無糖拿鐵、吃兩塊鳳梨酥", () => {
    const drafts = draftFromTextParse(
      {
        events: [
          {
            ...baseEvent,
            kind: "drink",
            localTime: "15:00",
            drinkType: "coffee",
            drinkName: "無糖拿鐵",
            volumeMl: 500,
            caffeineMg: 150,
            drinkKcal: 180,
          },
          { ...baseEvent, kind: "food", localTime: "15:00", items: [item("鳳梨酥", 230)] },
        ],
        unparsed: null,
      },
      now,
      TZ,
    );
    expect(drafts).toEqual([
      {
        kind: "drink",
        drinkType: "coffee",
        name: "無糖拿鐵",
        volumeMl: 500,
        caffeineMg: 150,
        sugarG: undefined,
        alcoholG: undefined,
        kcal: 180,
        occurredAt: "2026-10-21T15:00",
        confidence: 0.8,
      },
      {
        kind: "food",
        mealType: "snack",
        occurredAt: "2026-10-21T15:00",
        items: [{ name: "鳳梨酥", portion: "1 份", nutrition: { estimated: true, kcal: 230 }, confidence: 0.9 }],
        confidence: 0.8,
      },
    ]);
  });

  it("量測：血壓含脈搏、缺少數值的略過", () => {
    const drafts = draftFromTextParse(
      {
        events: [
          { ...baseEvent, kind: "measurement", measurementType: "blood_pressure", systolic: 128.4, diastolic: 82, pulse: 70 },
          { ...baseEvent, kind: "measurement", measurementType: "weight", weightKg: null },
        ],
        unparsed: null,
      },
      now,
      TZ,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ values: { systolic: 128, diastolic: 82, pulse: 70 } });
  });

  it("飲料沒有容量時預設 250 ml 並降低信心", () => {
    const [drink] = draftFromTextParse(
      { events: [{ ...baseEvent, kind: "drink", drinkType: "water", confidence: 0.9 }], unparsed: null },
      now,
      TZ,
    );
    expect(drink).toMatchObject({ volumeMl: 250, confidence: 0.5 });
  });
});

describe("draftFromTextParse：運動與症狀", () => {
  it("飯後散步 20 分鐘、有點頭痛", () => {
    const drafts = draftFromTextParse(
      {
        events: [
          { ...baseEvent, kind: "exercise", exerciseType: "walking", durationMin: 20, afterMeal: true },
          { ...baseEvent, kind: "symptom", symptomType: "headache", severity: 2.4, note: "太陽穴" },
          { ...baseEvent, kind: "exercise", exerciseType: "running", durationMin: null },
        ],
        unparsed: null,
      },
      now,
      TZ,
    );
    expect(drafts).toEqual([
      expect.objectContaining({ kind: "exercise", exerciseType: "walking", durationMin: 20, afterMeal: true }),
      expect.objectContaining({ kind: "symptom", symptomType: "headache", severity: 2, note: "太陽穴" }),
    ]);
  });
});

describe("draftFromFoodPhoto", () => {
  it("非食物照片回傳空陣列", () => {
    expect(
      draftFromFoodPhoto({ isFood: false, mealType: null, items: [], drinks: [], overallConfidence: 0.9, notes: null }, now, TZ),
    ).toEqual([]);
  });

  it("照片轉成一筆飲食草稿", () => {
    const [draft] = draftFromFoodPhoto(
      { isFood: true, mealType: "lunch", items: [item("滷雞腿", 300), item("  ")], drinks: [], overallConfidence: 1.2, notes: null },
      now,
      TZ,
    );
    expect(draft).toMatchObject({ kind: "food", mealType: "lunch", occurredAt: "2026-10-21T16:00", confidence: 1 });
    expect(draft.kind === "food" && draft.items.map((i) => i.name)).toEqual(["滷雞腿"]);
  });

  const drink = (overrides: Partial<AiDrinkItem>): AiDrinkItem => ({
    drinkType: "sugary",
    name: "珍珠奶茶",
    volumeMl: 700,
    caffeineMg: 80,
    sugarG: 50,
    alcoholG: null,
    kcal: 450,
    confidence: 0.8,
    ...overrides,
  });

  it("飲料另外成為飲料草稿", () => {
    const drafts = draftFromFoodPhoto(
      { isFood: true, mealType: "lunch", items: [item("排骨便當", 800)], drinks: [drink({})], overallConfidence: 0.9, notes: null },
      now,
      TZ,
    );
    expect(drafts.map((d) => d.kind)).toEqual(["food", "drink"]);
    expect(drafts[1]).toEqual({
      kind: "drink",
      drinkType: "sugary",
      name: "珍珠奶茶",
      volumeMl: 700,
      caffeineMg: 80,
      sugarG: 50,
      alcoholG: undefined,
      kcal: 450,
      occurredAt: "2026-10-21T16:00",
      confidence: 0.8,
    });
  });

  it("只有飲料時不產生飲食草稿；容量不明時用預設值並降低信心", () => {
    const drafts = draftFromFoodPhoto(
      { isFood: true, mealType: null, items: [], drinks: [drink({ drinkType: "coffee", volumeMl: null })], overallConfidence: 0.9, notes: null },
      now,
      TZ,
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ kind: "drink", drinkType: "coffee", volumeMl: 250, confidence: 0.5 });
  });
});

describe("sumNutrition", () => {
  it("加總有估算值的品項", () => {
    expect(
      sumNutrition([
        { nutrition: { estimated: true, kcal: 300, proteinG: 20.25 } },
        { nutrition: { estimated: true, kcal: 120 } },
        {},
      ]),
    ).toEqual({ estimated: true, kcal: 420, proteinG: 20.3 });
    expect(sumNutrition([{}])).toBeUndefined();
  });

  it("全部為使用者輸入時不標示為估算", () => {
    expect(sumNutrition([{ nutrition: { estimated: false, kcal: 500 } }, { nutrition: { estimated: false, kcal: 120 } }])).toEqual({
      estimated: false,
      kcal: 620,
    });
    expect(sumNutrition([{ nutrition: { estimated: false, kcal: 500 } }, { nutrition: { estimated: true, kcal: 100 } }])?.estimated).toBe(true);
  });
});

describe("ConfirmDraftSchema", () => {
  it("驗證使用者送出的草稿", () => {
    expect(
      ConfirmDraftSchema.safeParse({
        extractionId: "x",
        events: [{ kind: "food", mealType: "lunch", occurredAt: "2026-10-21T12:00", items: [{ name: " " }] }],
      }).success,
    ).toBe(false);
    expect(
      ConfirmDraftSchema.safeParse({
        extractionId: "x",
        events: [{ kind: "drink", drinkType: "water", volumeMl: 300, occurredAt: "2026-10-21T12:00" }],
      }).success,
    ).toBe(true);
  });
});
