import { describe, expect, it } from "vitest";
import { suggestGoals, type LabHistoryPoint } from "./goal-suggestions";

const lab = (code: string, measuredAt: string, value: number, referenceMin: number | null = null, referenceMax: number | null = null): LabHistoryPoint => ({
  code,
  measuredAt,
  value,
  referenceMin,
  referenceMax,
});

const base = {
  current: {},
  profile: { sex: "male" as const, heightCm: 179 },
  activeMetrics: new Set<string>(),
  today: "2026-10-26",
};

describe("suggestGoals", () => {
  it("依報告參考範圍建議，並附上歷年趨勢", () => {
    const [tg] = suggestGoals({
      ...base,
      labs: [lab("TG", "2022-06-29", 302, 30, 150), lab("TG", "2024-09-16", 253, 30, 150)],
    });
    expect(tg).toMatchObject({ metric: "TG", baseline: 253, target: 150, direction: "decrease", targetDate: "2027-01-26" });
    expect(tg.history.map((h) => h.value)).toEqual([302, 253]);
    expect(tg.reason).toBe("最新 253 mg/dL，高於報告參考範圍上限 150，比 2022 年下降 49 mg/dL。");
  });

  it("沒有參考範圍時用一般建議值；HDL 只在偏低時建議", () => {
    const result = suggestGoals({
      ...base,
      labs: [lab("WAIST", "2026-08-10", 92), lab("HDL", "2026-08-10", 39), lab("LDL", "2026-08-10", 95)],
    });
    expect(result.map((s) => [s.metric, s.target, s.direction])).toEqual([
      ["HDL", 40, "increase"],
      ["WAIST", 90, "decrease"],
    ]);
    expect(result.find((s) => s.metric === "WAIST")!.targetDate).toBe("2027-04-26");
  });

  it("體重以減重 5% 為階段目標，不低於 BMI 24；以最新的每日量測為基準", () => {
    const [weight] = suggestGoals({ ...base, labs: [lab("WEIGHT", "2026-08-10", 85.8)], current: { WEIGHT: 86.4 } });
    expect(weight).toMatchObject({ baseline: 86.4, target: 82.1 });
    expect(weight.reason).toContain("BMI 27");
  });

  it("已有目標、正常範圍或缺身高時不建議", () => {
    expect(
      suggestGoals({
        ...base,
        profile: { sex: "male", heightCm: null },
        activeMetrics: new Set(["TG"]),
        labs: [lab("TG", "2026-08-10", 253, null, 150), lab("GLU_AC", "2026-08-10", 92, 70, 100), lab("WEIGHT", "2026-08-10", 90)],
      }),
    ).toEqual([]);
  });

  it("依偏離程度排序並限制數量", () => {
    const result = suggestGoals({
      ...base,
      limit: 2,
      labs: [lab("GGT", "2024-09-16", 119, 9, 64), lab("TG", "2024-09-16", 253, 30, 150), lab("SBP", "2024-09-16", 131, 90, 120)],
    });
    expect(result.map((s) => s.metric)).toEqual(["GGT", "TG"]);
  });
});
