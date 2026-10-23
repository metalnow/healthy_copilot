import { describe, expect, it } from "vitest";
import { drinkIntake, foodIntake, macroShares, sumIntake } from "./nutrition";

describe("每日營養攝取", () => {
  const lunch = foodIntake({
    id: "f1",
    occurredAt: "2026-10-23T04:00:00Z",
    totalNutrition: { estimated: true, kcal: 800, proteinG: 30, fatG: 35, carbG: 90, sodiumMg: 1200 },
  });
  const tea = drinkIntake({
    id: "d1",
    occurredAt: "2026-10-23T05:00:00Z",
    drinkType: "sugary",
    nutrition: { estimated: true, kcal: 450 },
    sugarG: 50,
    caffeineMg: 80,
    alcoholG: null,
  });
  const water = drinkIntake({ id: "d2", occurredAt: "", drinkType: "water", nutrition: null, sugarG: null, caffeineMg: null, alcoholG: null });
  const snack = foodIntake({ id: "f2", occurredAt: "", totalNutrition: null });

  it("飲料的糖、咖啡因併入；水為 0 kcal", () => {
    expect(tea.values).toEqual({ kcal: 450, sugarG: 50, caffeineMg: 80 });
    expect(water.values).toEqual({ kcal: 0 });
    expect(water.estimated).toBe(false);
  });

  it("加總飲食與飲料，並計算沒有熱量的筆數", () => {
    expect(sumIntake([lunch, tea, water, snack])).toEqual({
      totals: { kcal: 1250, proteinG: 30, fatG: 35, carbG: 90, sodiumMg: 1200, sugarG: 50, caffeineMg: 80 },
      estimated: true,
      missingKcal: 1,
    });
  });

  it("三大營養素熱量比例", () => {
    expect(macroShares({ proteinG: 30, fatG: 35, carbG: 90 })).toEqual({ protein: 15, fat: 40, carb: 45 });
    expect(macroShares({})).toBeNull();
    expect(macroShares({ proteinG: 72 })).toBeNull();
  });
});
