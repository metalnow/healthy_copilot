import { describe, expect, it } from "vitest";
import {
  defaultFlag,
  flagFromReference,
  isGroupedByName,
  LAB_CODES,
  labDisplayName,
  normalizeUnitString,
  rastClass,
  toCanonicalUnit,
} from "./catalog";

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
    ["WBC", 5.1, "10^3/μL", 5.1, "10³/µL"],
    ["PLT", 240, "10^9/L", 240, "10³/µL"],
    ["RBC", 4.6, "10^6/μL", 4.6, "10⁶/µL"],
    ["NA", 139, "meq/L", 139, "mmol/L"],
    ["BUN", 4.3, "mmol/L", 12.04, "mg/dL"],
  ])("%s %d %s → %d %s", (code, value, unit, expected, expectedUnit) => {
    expect(toCanonicalUnit(code, value, unit)).toEqual({ value: expected, unit: expectedUnit, converted: true });
  });

  it("已是標準單位或無法換算時保留原值", () => {
    expect(toCanonicalUnit("TG", 193, "mg/dl")).toEqual({ value: 193, unit: "mg/dL", converted: false });
    expect(toCanonicalUnit("IGE_SPECIFIC", 4.97, "KUA/l")).toEqual({ value: 4.97, unit: "kUA/L", converted: false });
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

  it("過敏原 IgE 分級", () => {
    expect(rastClass(0.09)).toEqual({ level: 0, label: "無過敏反應" });
    expect(rastClass(0.57)).toEqual({ level: 1, label: "低程度" });
    expect(rastClass(4.97)).toEqual({ level: 3, label: "中高程度" });
    expect(rastClass(19.2)).toEqual({ level: 4, label: "高程度" });
    expect(rastClass(120)).toEqual({ level: 6, label: "最高程度" });
  });

  it("過敏原沒有逐項參考值時以 0.35 判斷陽性", () => {
    expect(defaultFlag("IGE_SPECIFIC", 0.57, null)).toBe("high");
    expect(defaultFlag("IGE_SPECIFIC", 0.09, null)).toBe("normal");
    expect(defaultFlag("IGE_SPECIFIC", null, "<0.35")).toBe("normal");
    expect(defaultFlag("TG", 300, null)).toBeNull();
  });

  it("過敏原、超音波與其他項目依名稱顯示", () => {
    expect(isGroupedByName("IGE_SPECIFIC")).toBe(true);
    expect(isGroupedByName("TG")).toBe(false);
    expect(labDisplayName({ code: "IGE_SPECIFIC", displayName: "e1 貓皮毛" })).toBe("e1 貓皮毛");
    expect(labDisplayName({ code: "ULTRASOUND", displayName: "甲狀腺超音波" })).toBe("甲狀腺超音波");
    expect(labDisplayName({ code: "TG", displayName: "T-G三酸甘油脂" })).toBe("三酸甘油酯");
  });
});
