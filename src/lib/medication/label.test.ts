import { describe, expect, it } from "vitest";
import type { MedicationLabel } from "@/lib/ai/schemas";
import { medicationDraftFromLabel } from "./label";

const label = (overrides: Partial<MedicationLabel>): MedicationLabel => ({
  isMedication: true,
  name: "維他命 D3 1000 IU",
  category: "supplement",
  dosePerIntake: 1,
  unit: "粒",
  timing: null,
  timesPerDay: 1,
  confidence: 0.9,
  notes: null,
  ...overrides,
});

describe("medicationDraftFromLabel", () => {
  it("帶入品名、劑量與每日次數對應的時間", () => {
    expect(medicationDraftFromLabel(label({ timing: "after_meal", timesPerDay: 3 }))).toEqual({
      name: "維他命 D3 1000 IU",
      category: "supplement",
      dose: 1,
      unit: "粒",
      timing: "after_meal",
      times: ["08:00", "13:00", "19:00"],
    });
  });

  it("睡前一次排在晚上", () => {
    expect(medicationDraftFromLabel(label({ timing: "bedtime", timesPerDay: null })).times).toEqual(["21:30"]);
  });

  it("沒有標示或次數不合理時不預填時間與劑量", () => {
    const draft = medicationDraftFromLabel(
      label({ name: "  ", category: null, dosePerIntake: 0, unit: null, timesPerDay: 12 }),
    );
    expect(draft).toEqual({ name: undefined, category: undefined, dose: undefined, unit: undefined, timing: undefined, times: [] });
  });
});
