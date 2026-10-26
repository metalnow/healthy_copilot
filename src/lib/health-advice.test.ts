import { describe, expect, it } from "vitest";
import { adviceForFinding, adviceForMetric, checkNutrients, looksAbnormal } from "./health-advice";

describe("health advice", () => {
  it("檢驗項目對應改善行動", () => {
    expect(adviceForMetric("TG")?.topic).toBe("三酸甘油酯");
    expect(adviceForMetric("WAIST")).toBe(adviceForMetric("WEIGHT"));
    expect(adviceForMetric("HBSAG")).toBeNull();
  });

  it("描述性發現依內容對應，忽略否定描述", () => {
    expect(adviceForFinding("輕度脂肪肝，膽囊息肉 0.3 cm").map((a) => a.topic)).toEqual(["脂肪肝", "息肉"]);
    expect(adviceForFinding("Fatty liver, mild")).toHaveLength(1);
    expect(adviceForFinding("未見結石，無脂肪肝")).toEqual([]);
    expect(looksAbnormal("肝臟無明顯異常")).toBe(false);
    expect(adviceForFinding("三酸甘油酯偏高 3 個月後複檢血脂").map((a) => a.topic)).toEqual(["三酸甘油酯", "膽固醇"]);
    expect(adviceForFinding("脂肪肝，肝功能異常").map((a) => a.topic)).toEqual(["脂肪肝"]);
    expect(looksAbnormal("右腎囊腫 1.2 cm")).toBe(true);
  });

  it("近期飲食只列出超過或不足建議量的營養素", () => {
    const advice = adviceForMetric("GLU_AC")!;
    expect(checkNutrients(advice.nutrients!, { sugarG: 80, fiberG: 30 })).toEqual([
      expect.objectContaining({ key: "sugarG", value: 80 }),
    ]);
    expect(checkNutrients(advice.nutrients!, {})).toEqual([]);
  });
});
