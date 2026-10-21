import { describe, expect, it } from "vitest";
import { flagFromReference, LAB_CODES, normalizeUnitString, toCanonicalUnit } from "./catalog";

describe("lab catalog", () => {
  it("代碼不重複", () => {
    expect(new Set(LAB_CODES).size).toBe(LAB_CODES.length);
  });

  it("單位正規化", () => {
    expect(normalizeUnitString(" mmol/L ")).toBe("mmol/l");
    expect(normalizeUnitString("umol/L")).toBe("µmol/l");
    expect(normalizeUnitString("μmol/L")).toBe("µmol/l");
    expect(normalizeUnitString("mL/min/1.73 m2")).toBe("ml/min/1.73m²");
  });

  it.each([
    ["GLU_AC", 5.5, "mmol/L", 99.09, "mg/dL"],
    ["TG", 2.18, "mmol/L", 193.08, "mg/dL"],
    ["HDL", 0.85, "mmol/L", 32.87, "mg/dL"],
    ["CREA", 88.4, "umol/L", 1, "mg/dL"],
    ["UA", 416, "µmol/L", 6.99, "mg/dL"],
    ["HBA1C", 44, "mmol/mol", 6.18, "%"],
    ["AST", 25, "IU/L", 25, "U/L"],
  ])("%s %d %s → %d %s", (code, value, unit, expected, expectedUnit) => {
    expect(toCanonicalUnit(code, value, unit)).toEqual({ value: expected, unit: expectedUnit, converted: true });
  });

  it("已是標準單位或無法換算時保留原值", () => {
    expect(toCanonicalUnit("TG", 193, "mg/dl")).toEqual({ value: 193, unit: "mg/dL", converted: false });
    expect(toCanonicalUnit("TG", 193, "g/L")).toEqual({ value: 193, unit: "g/L", converted: false });
    expect(toCanonicalUnit("OTHER", 1, "x")).toEqual({ value: 1, unit: "x", converted: false });
    expect(toCanonicalUnit("LDL", 120, null)).toEqual({ value: 120, unit: "mg/dL", converted: false });
  });

  it("依參考範圍判斷高低", () => {
    expect(flagFromReference(193, null, 150)).toBe("high");
    expect(flagFromReference(33, 40, null)).toBe("low");
    expect(flagFromReference(100, 70, 100)).toBe("normal");
    expect(flagFromReference(null, 1, 2)).toBe("unknown");
    expect(flagFromReference(5, null, null)).toBe("unknown");
  });
});
