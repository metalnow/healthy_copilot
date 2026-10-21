import { describe, expect, it } from "vitest";
import { ConfirmLabsSchema, labDraftFromExtraction, toLabObservationValues } from "./review";

const base = {
  value: null,
  textValue: null,
  unit: null,
  referenceMin: null,
  referenceMax: null,
  referenceText: null,
  abnormalFlag: null,
  page: 1,
  confidence: 0.9,
};

describe("lab review", () => {
  it("AI 結果轉草稿：未知代碼改為 OTHER、略過沒有結果的項目", () => {
    const draft = labDraftFromExtraction({
      isHealthReport: true,
      reportDate: "2026-09-15",
      institution: "某某醫院",
      notes: null,
      items: [
        { ...base, code: "TG", displayName: "三酸甘油酯", value: 2.18, unit: "mmol/L", referenceMax: 1.7 },
        { ...base, code: "FOO", displayName: "鐵蛋白", value: 120, unit: "ng/mL" },
        { ...base, code: "HBSAG", displayName: "HBsAg", textValue: "陰性" },
        { ...base, code: "LDL", displayName: "LDL" },
      ],
    });
    expect(draft.reportDate).toBe("2026-09-15");
    expect(draft.items.map((i) => i.code)).toEqual(["TG", "OTHER", "HBSAG"]);
  });

  it("數值與參考範圍一起換算，並依範圍判斷異常", () => {
    expect(
      toLabObservationValues({ code: "TG", displayName: "TG", value: 2.18, unit: "mmol/L", referenceMax: 1.7 }),
    ).toMatchObject({ value: 193.08, unit: "mg/dL", referenceMax: 150.57, abnormalFlag: "high" });
  });

  it("報告有標示時以報告為準；質性結果保留單位為空", () => {
    expect(
      toLabObservationValues({ code: "HDL", displayName: "HDL", value: 33, unit: "mg/dL", abnormalFlag: "low" }),
    ).toMatchObject({ value: 33, abnormalFlag: "low" });
    expect(toLabObservationValues({ code: "HBSAG", displayName: "HBsAg", textValue: "陰性" })).toMatchObject({
      value: null,
      textValue: "陰性",
      unit: null,
      abnormalFlag: "unknown",
    });
  });

  it("確認時每個項目需要結果與合法日期", () => {
    expect(
      ConfirmLabsSchema.safeParse({ documentId: "d", reportDate: "2026-09-15", items: [{ code: "TG", displayName: "TG" }] })
        .success,
    ).toBe(false);
    expect(
      ConfirmLabsSchema.safeParse({ documentId: "d", reportDate: "2026/09/15", items: [{ code: "TG", displayName: "TG", value: 1 }] })
        .success,
    ).toBe(false);
  });
});
