import { describe, expect, it } from "vitest";
import { formatDuration, minutesBetween, resolveSleepTimes, sleepDurationMin } from "./sleep";

describe("sleep", () => {
  it("分鐘數與不合理值", () => {
    expect(minutesBetween("2026-10-20T15:30:00Z", "2026-10-20T22:12:00Z")).toBe(402);
    expect(minutesBetween("2026-10-21T00:00:00Z", "2026-10-20T00:00:00Z")).toBeNull();
    expect(minutesBetween(null, "2026-10-20T00:00:00Z")).toBeNull();
  });

  it("睡眠時數：有量測值優先，否則扣掉清醒時間", () => {
    const base = { sleepStartAt: "2026-10-20T15:30:00Z", bedtimeAt: null, wakeAt: "2026-10-20T22:30:00Z" };
    expect(sleepDurationMin({ ...base, totalSleepMin: 380 })).toBe(380);
    expect(sleepDurationMin({ ...base, totalSleepMin: null, awakeMin: 20 })).toBe(400);
  });

  it("顯示格式", () => {
    expect(formatDuration(402)).toBe("6 小時 42 分");
    expect(formatDuration(45)).toBe("45 分");
  });

  it("截圖時刻：入睡晚於起床代表前一天", () => {
    const now = new Date("2026-10-21T01:00:00Z"); // 台北 09:00
    const result = resolveSleepTimes({ sleepStart: "23:30", sleepEnd: "06:45" }, now, "Asia/Taipei");
    expect(result?.sleepStartAt?.toISOString()).toBe("2026-10-20T15:30:00.000Z");
    expect(result?.wakeAt.toISOString()).toBe("2026-10-20T22:45:00.000Z");
    expect(resolveSleepTimes({ sleepStart: "01:10", sleepEnd: "07:00" }, now, "Asia/Taipei")?.sleepStartAt?.toISOString()).toBe(
      "2026-10-20T17:10:00.000Z",
    );
    expect(resolveSleepTimes({ sleepStart: null, sleepEnd: "bad" }, now, "Asia/Taipei")).toBeNull();
  });
});
