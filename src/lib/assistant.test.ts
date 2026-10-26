import { describe, expect, it } from "vitest";
import { buildAssistantMessages, greeting, pageTip, type AssistantInput } from "./assistant";

const base: AssistantInput = {
  today: "2026-10-26",
  now: "09:30",
  medications: [],
  followUps: [],
  findingSuggestions: 0,
  reportsToConfirm: 0,
  foodRecordsToday: 1,
  lastWeightDate: "2026-10-25",
  goalSuggestions: 0,
};

describe("buildAssistantMessages", () => {
  it("沒有需要提醒的事就沒有訊息，改由招呼語", () => {
    expect(buildAssistantMessages(base)).toEqual([]);
    expect(greeting("09:30").text).toMatch(/^早安/);
    expect(greeting("23:10").text).toMatch(/^晚安/);
  });

  it("用藥：到時間還沒打勾才提醒，超過一小時較緊急", () => {
    const medications = [
      { scheduleId: "s1", name: "Vitamin D", localTime: "08:00" },
      { scheduleId: "s2", name: "魚油", localTime: "20:00" },
    ];
    const [med] = buildAssistantMessages({ ...base, medications });
    expect(med).toMatchObject({ id: "med:2026-10-26:s1", mood: "worried", priority: 90, href: "/" });
    expect(med.text).toContain("Vitamin D（08:00）");
    expect(med.text).not.toContain("魚油");
    expect(buildAssistantMessages({ ...base, now: "07:00", medications })).toEqual([]);
  });

  it("追蹤事項：過期與一週內的預約，依優先順序排列", () => {
    const messages = buildAssistantMessages({
      ...base,
      reportsToConfirm: 1,
      followUps: [
        { id: "f1", finding: "膽囊息肉", action: "複檢腹部超音波", status: "open", dueDate: "2026-10-01" },
        { id: "f2", finding: "脂肪肝", action: "至肝膽腸胃科回診", status: "scheduled", dueDate: "2026-10-27" },
      ],
    });
    expect(messages.map((m) => m.id.split(":")[0])).toEqual(["followup-soon", "followup-overdue", "reports"]);
    expect(messages[0].text).toBe("提醒你，明天要至肝膽腸胃科回診。");
    expect(messages[1].text).toContain("「膽囊息肉」已經過了建議追蹤的日期");
  });

  it("下午還沒記錄飲食、超過一週沒量體重時提醒", () => {
    const ids = buildAssistantMessages({ ...base, now: "14:00", foodRecordsToday: 0, lastWeightDate: "2026-10-10" }).map((m) => m.id);
    expect(ids).toEqual(["food:2026-10-26", "weight:2026-10-26"]);
  });
});

describe("pageTip", () => {
  it("依路徑給說明", () => {
    expect(pageTip("/health/reports/new")?.text).toContain("塗黑");
    expect(pageTip("/log/activity/abc")?.id).toBe("tip:/log/activity");
    expect(pageTip("/")).toBeNull();
  });
});
