import { describe, expect, it } from "vitest";
import { goalDirection, goalProgress, isGoalReached } from "./goals";

describe("goals", () => {
  it("由基準與目標推導方向", () => {
    expect(goalDirection(193, 150)).toBe("decrease");
    expect(goalDirection(33, 40)).toBe("increase");
    expect(goalDirection(null, 40)).toBe("maintain");
  });

  it("進度百分比，超過目標以 100% 計", () => {
    const tg = { baselineValue: 193, targetValue: 150, direction: "decrease" as const };
    expect(goalProgress(tg, 171.5)).toBeCloseTo(0.5);
    expect(goalProgress(tg, 140)).toBe(1);
    expect(goalProgress(tg, 210)).toBe(0);
    expect(goalProgress(tg, null)).toBeNull();
  });

  it("是否達標", () => {
    expect(isGoalReached({ targetValue: 5.9, direction: "decrease" }, 5.8)).toBe(true);
    expect(isGoalReached({ targetValue: 40, direction: "increase" }, 38)).toBe(false);
  });
});
