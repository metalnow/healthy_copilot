import { describe, expect, it } from "vitest";
import { eventTimeFields, isValidTimeZone, localWeekdayAndHour, toLocalDate } from "./time";

describe("time", () => {
  it("UTC 16:30 在台北已是隔天", () => {
    expect(toLocalDate("2026-10-19T16:30:00Z", "Asia/Taipei")).toBe("2026-10-20");
    expect(toLocalDate("2026-10-19T16:30:00Z", "UTC")).toBe("2026-10-19");
  });

  it("帶時區位移的輸入會被正確解析", () => {
    expect(toLocalDate("2026-10-20T00:10:00+08:00", "Asia/Taipei")).toBe("2026-10-20");
  });

  it("無效日期拋錯", () => {
    expect(() => toLocalDate("not-a-date", "Asia/Taipei")).toThrow();
  });

  it("驗證 IANA 時區", () => {
    expect(isValidTimeZone("Asia/Taipei")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });

  it("取得當地星期與小時", () => {
    // 2026-10-25 是週日，UTC 13:00 = 台北 21:00
    expect(localWeekdayAndHour(new Date("2026-10-25T13:00:00Z"), "Asia/Taipei")).toEqual({
      weekday: 0,
      hour: 21,
    });
  });

  it("eventTimeFields 轉成 UTC ISO 並附上當地日期", () => {
    expect(eventTimeFields("2026-10-20T07:30:00+08:00", "Asia/Taipei")).toEqual({
      occurredAt: "2026-10-19T23:30:00.000Z",
      localDate: "2026-10-20",
      timezone: "Asia/Taipei",
    });
  });
});
