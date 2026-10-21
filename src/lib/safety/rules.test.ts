import { describe, expect, it } from "vitest";
import { evaluateBloodPressure, evaluateHeartRate, evaluateSymptom } from "./rules";

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

describe("evaluateSymptom", () => {
  it.each([
    [{ type: "chest_pain", severity: 1 }, "symptom_chest_pain", "emergency"],
    [{ type: "dyspnea", severity: 2 }, "symptom_dyspnea", "urgent"],
    [{ type: "dyspnea", severity: 4 }, "symptom_dyspnea", "emergency"],
    [{ type: "syncope", severity: 1 }, "symptom_syncope", "urgent"],
    [{ type: "allergic_reaction", severity: 3 }, "symptom_anaphylaxis_risk", "emergency"],
    [{ type: "hives", severity: 4 }, "symptom_anaphylaxis_risk", "emergency"],
    [{ type: "palpitations", severity: 5 }, "symptom_palpitations", "caution"],
    [{ type: "fever", severity: 4 }, "symptom_high_fever", "caution"],
  ])("%o → %s", (symptom, ruleId, level) => {
    expect(evaluateSymptom(symptom)).toMatchObject({ ruleId, level });
  });

  it.each([
    { type: "hives", severity: 2 },
    { type: "allergic_reaction", severity: 2 },
    { type: "headache", severity: 5 },
    { type: "fever", severity: 2 },
  ])("%o → 無提醒", (symptom) => {
    expect(evaluateSymptom(symptom)).toBeNull();
  });
});
