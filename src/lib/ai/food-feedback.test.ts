import { describe, expect, it } from "vitest";
import { personalFoodContext, summarizeFoodFeedback } from "./food-feedback";

const ai = (name: string, portion: string | null = null, inferred = false) => ({ name, portion, inferred });
const saved = (name: string, portion: string | null = null) => ({ name, portion });

describe("summarizeFoodFeedback", () => {
  it("整理漏掉、誤判、推測與份量的修正", () => {
    const lines = summarizeFoodFeedback([
      { ai: [ai("滷肉", "1 份")], saved: [saved("滷肉", "1 份"), saved("白飯", "半碗")], note: "下面有半碗飯" },
      { ai: [ai("牛肉麵湯頭"), ai("麵", "1 球", true)], saved: [saved("牛肉麵湯頭"), saved("麵", "半球")] },
      { ai: [ai("雞腿"), ai("白飯", "1 碗", true), ai("醃蘿蔔")], saved: [saved("雞腿"), saved("白飯")] },
      { ai: [ai("燙青菜"), ai("白飯", "1 碗", true)], saved: [saved("燙青菜"), saved("白飯 ")], note: "吃完很撐" },
      { ai: [ai("咖哩"), ai("白飯", "1 碗", true)], saved: [saved("咖哩")] },
    ]);
    expect(lines).toEqual([
      "照片中常被漏掉、使用者自行補上：白飯（1 次）",
      "曾被誤判、使用者刪除：醃蘿蔔（1 次）",
      "推測容器下方的主食：使用者保留 3 次、刪除 1 次（多半正確）",
      "份量修正：「麵」AI 估「1 球」，使用者改成「半球」",
      "使用者曾補充：「下面有半碗飯」",
    ]);
  });

  it("沒有修正時沒有提示", () => {
    expect(summarizeFoodFeedback([{ ai: [ai("便當")], saved: [saved("便當")] }])).toEqual([]);
    expect(personalFoodContext({ hints: "  ", learned: [] })).toBeNull();
  });

  it("組合個人化說明", () => {
    expect(personalFoodContext({ hints: "家裡是小碗", learned: ["推測容器下方的主食：使用者保留 0 次、刪除 2 次（多半其實沒有，推測時要保守）"] })).toBe(
      "使用者自己寫的飲食習慣：家裡是小碗\n使用者過去的修正：\n- 推測容器下方的主食：使用者保留 0 次、刪除 2 次（多半其實沒有，推測時要保守）",
    );
  });
});
