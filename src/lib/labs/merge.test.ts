import { describe, expect, it } from "vitest";
import type { LabExtraction } from "@/lib/ai/schemas";
import { chunkPages, mergeLabExtractions } from "./merge";

const item = (code: string, displayName: string, value: number | null, textValue: string | null = null) => ({
  code,
  displayName,
  value,
  textValue,
  unit: null,
  referenceMin: null,
  referenceMax: null,
  referenceText: null,
  abnormalFlag: null,
  page: 1,
  confidence: 0.9,
});
const part = (overrides: Partial<LabExtraction>): LabExtraction => ({
  isHealthReport: true,
  reportDate: null,
  institution: null,
  items: [],
  notes: null,
  ...overrides,
});

describe("mergeLabExtractions", () => {
  it("串接各批項目、去除重複，日期與院所取第一個有值的", () => {
    const merged = mergeLabExtractions([
      part({ reportDate: "2026-08-10", items: [item("WEIGHT", "體重", 85.8), item("TG", "三酸甘油脂", 253)], notes: "第 2 頁模糊" }),
      part({ isHealthReport: false, institution: "博仁綜合醫院", items: [item("TG", "三酸甘油脂", 253), item("HBSAG", "HBsAg", null, "陰性")] }),
    ]);
    expect(merged.reportDate).toBe("2026-08-10");
    expect(merged.institution).toBe("博仁綜合醫院");
    expect(merged.isHealthReport).toBe(true);
    expect(merged.items.map((i) => i.code)).toEqual(["WEIGHT", "TG", "HBSAG"]);
    expect(merged.notes).toBe("第 2 頁模糊");
  });

  it("依頁數切批", () => {
    expect(chunkPages([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
