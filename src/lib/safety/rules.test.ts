import { describe, expect, it } from "vitest";
import { evaluateBloodPressure, evaluateHeartRate } from "./rules";

describe("evaluateBloodPressure", () => {
  it.each([
    [{ systolic: 120, diastolic: 80 }, null],
    [{ systolic: 159, diastolic: 99 }, null],
    [{ systolic: 160, diastolic: 90 }, "bp_high"],
    [{ systolic: 150, diastolic: 100 }, "bp_high"],
    [{ systolic: 180, diastolic: 90 }, "bp_severe_high"],
    [{ systolic: 170, diastolic: 120 }, "bp_severe_high"],
    [{ systolic: 89, diastolic: 55 }, "bp_low"],
    [{ systolic: 90, diastolic: 55 }, null],
  ])("%o → %s", (bp, ruleId) => {
    expect(evaluateBloodPressure(bp)?.ruleId ?? null).toBe(ruleId);
  });

  it("極高血壓為 urgent 並提到 119", () => {
    const alert = evaluateBloodPressure({ systolic: 190, diastolic: 110 });
    expect(alert?.level).toBe("urgent");
    expect(alert?.message).toContain("119");
  });
});

describe("evaluateHeartRate", () => {
  it.each([
    [72, null],
    [120, null],
    [121, "hr_high"],
    [40, null],
    [39, "hr_low"],
  ])("%i bpm → %s", (bpm, ruleId) => {
    expect(evaluateHeartRate(bpm)?.ruleId ?? null).toBe(ruleId);
  });
});
