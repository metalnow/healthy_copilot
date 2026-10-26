import { describe, expect, it } from "vitest";
import { dueDateFor, followUpDraftsFromExtraction, suggestFindingFollowUps } from "./follow-ups";

type Lab = Parameters<typeof suggestFindingFollowUps>[0][number]["latest"];
const lab = (overrides: Partial<Lab>): Lab => ({
  code: "ULTRASOUND",
  displayName: "腹部超音波",
  value: null,
  textValue: null,
  abnormalFlag: null,
  measuredAt: "2026-08-10",
  sourceDocumentId: "doc1",
  ...overrides,
});

describe("followUpDraftsFromExtraction", () => {
  it("略過空白、整理間隔月數", () => {
    const drafts = followUpDraftsFromExtraction({
      followUps: [
        { finding: " 脂肪肝 ", action: "定期至肝膽腸胃科追蹤", department: "肝膽腸胃科", intervalMonths: 6, page: 3 },
        { finding: "", action: "多運動", department: null, intervalMonths: null, page: null },
        { finding: "膽囊息肉", action: "複檢超音波", department: null, intervalMonths: 0.4, page: null },
      ],
    });
    expect(drafts).toEqual([
      { finding: "脂肪肝", action: "定期至肝膽腸胃科追蹤", department: "肝膽腸胃科", intervalMonths: 6 },
      { finding: "膽囊息肉", action: "複檢超音波", department: undefined, intervalMonths: undefined },
    ]);
  });

  it("追蹤日期 = 報告日期 + 間隔", () => {
    expect(dueDateFor("2026-08-10", 6)).toBe("2027-02-10");
    expect(dueDateFor("2026-08-10", undefined)).toBeNull();
  });
});

describe("suggestFindingFollowUps", () => {
  it("超音波異常發現：依內容給追蹤方式；正常或否定描述不提示", () => {
    const suggestions = suggestFindingFollowUps(
      [
        { key: "ULTRASOUND:腹部超音波", latest: lab({ textValue: "輕度脂肪肝，膽囊息肉 0.3 cm" }) },
        { key: "ULTRASOUND:攝護腺超音波", latest: lab({ displayName: "攝護腺超音波", textValue: "未見結石，大小正常" }) },
        { key: "ULTRASOUND:甲狀腺超音波", latest: lab({ displayName: "甲狀腺超音波", textValue: "正常" }) },
      ],
      [],
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      labKey: "ULTRASOUND:腹部超音波",
      finding: "腹部超音波：輕度脂肪肝，膽囊息肉 0.3 cm",
      action: "依報告建議定期追蹤肝功能與腹部超音波。",
      foundAt: "2026-08-10",
    });
  });

  it("已有同一次結果的追蹤事項（含不追蹤）就不再提示；新的一次報告會再提示", () => {
    const latest = lab({ textValue: "脂肪肝" });
    const input = [{ key: "ULTRASOUND:腹部超音波", latest }];
    expect(suggestFindingFollowUps(input, [{ labKey: "ULTRASOUND:腹部超音波", foundAt: "2026-08-10" }])).toHaveLength(0);
    expect(suggestFindingFollowUps(input, [{ labKey: "ULTRASOUND:腹部超音波", foundAt: "2024-09-16" }])).toHaveLength(1);
  });

  it("同一份報告的追蹤建議已提到這個項目時不再提示", () => {
    const input = [{ key: "ULTRASOUND:腹部超音波", latest: lab({ textValue: "中度脂肪肝" }) }];
    const fromReport = { labKey: null, foundAt: "2026-08-10", sourceDocumentId: "doc1", finding: "腹部超音波：中度脂肪肝" };
    expect(suggestFindingFollowUps(input, [fromReport])).toHaveLength(0);
    expect(suggestFindingFollowUps(input, [{ ...fromReport, sourceDocumentId: "doc2" }])).toHaveLength(1);
  });

  it("文字結果與腫瘤標記看異常標示；一般數值項目與過敏原不提示", () => {
    const suggestions = suggestFindingFollowUps(
      [
        { key: "HBSAG", latest: lab({ code: "HBSAG", displayName: "HBsAg", textValue: "陽性", abnormalFlag: "high" }) },
        { key: "PSA", latest: lab({ code: "PSA", displayName: "PSA", value: 6.2, abnormalFlag: "high" }) },
        { key: "TG", latest: lab({ code: "TG", displayName: "TG", value: 253, abnormalFlag: "high" }) },
        { key: "IGE_SPECIFIC:d1 塵蟎", latest: lab({ code: "IGE_SPECIFIC", displayName: "d1 塵蟎", value: 20, abnormalFlag: "high" }) },
      ],
      [],
    );
    expect(suggestions.map((s) => s.labKey)).toEqual(["HBSAG", "PSA"]);
    expect(suggestions[1].action).toBe("回診與醫師討論是否需要複檢。");
  });
});
