import { describe, expect, it } from "vitest";
import { parseMedicationForm } from "./form";

function form(entries: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

describe("parseMedicationForm", () => {
  it("解析藥物與多個服用時間，時間排序去重", () => {
    const result = parseMedicationForm(
      form([
        ["name", "Vitamin D"],
        ["category", "supplement"],
        ["dose", "1"],
        ["unit", "顆"],
        ["timing", "after_meal"],
        ["localTime", "21:00"],
        ["localTime", "08:00"],
        ["localTime", "08:00"],
        ["localTime", ""],
      ]),
    );
    expect(result).toEqual({
      ok: true,
      medication: {
        name: "Vitamin D",
        category: "supplement",
        dose: 1,
        unit: "顆",
        timing: "after_meal",
        active: true,
      },
      schedules: [{ localTime: "08:00" }, { localTime: "21:00" }],
    });
  });

  it("勾選部分星期才寫入 daysOfWeek", () => {
    const result = parseMedicationForm(
      form([
        ["name", "B Complex"],
        ["category", "supplement"],
        ["localTime", "08:00"],
        ["daysOfWeek", "5"],
        ["daysOfWeek", "1"],
        ["daysOfWeek", "3"],
      ]),
    );
    expect(result.ok && result.schedules).toEqual([{ localTime: "08:00", daysOfWeek: [1, 3, 5] }]);
  });

  it("缺少必填欄位", () => {
    const result = parseMedicationForm(form([["dose", "-1"]]));
    expect(!result.ok && result.fieldErrors).toEqual({
      name: "請輸入名稱（最多 100 字）",
      category: "請選擇類別",
      dose: "劑量必須是大於 0 的數字",
      localTime: "請至少設定一個服用時間",
    });
  });

  it("時間格式錯誤", () => {
    const result = parseMedicationForm(
      form([
        ["name", "X"],
        ["category", "otc"],
        ["localTime", "25:00"],
      ]),
    );
    expect(!result.ok && result.fieldErrors.localTime).toBe("服用時間或星期設定不正確");
  });
});
