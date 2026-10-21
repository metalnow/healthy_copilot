import { describe, expect, it } from "vitest";
import {
  eventTimeFields,
  fromDateTimeLocalValue,
  isValidTimeZone,
  localWeekdayAndHour,
  toDateTimeLocalValue,
  toLocalDate,
  toLocalTime,
  weekdayOfLocalDate,
} from "./time";

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

  it("datetime-local 值依使用者時區換算", () => {
    expect(fromDateTimeLocalValue("2026-10-21T07:30", "Asia/Taipei").toISOString()).toBe(
      "2026-10-20T23:30:00.000Z",
    );
    expect(toDateTimeLocalValue(new Date("2026-10-20T23:30:00Z"), "Asia/Taipei")).toBe(
      "2026-10-21T07:30",
    );
  });

  it("夏令時間時區也能正確換算", () => {
    // 紐約 2026-07-01 為 EDT（UTC-4），2026-12-01 為 EST（UTC-5）
    expect(fromDateTimeLocalValue("2026-07-01T08:00", "America/New_York").toISOString()).toBe(
      "2026-07-01T12:00:00.000Z",
    );
    expect(fromDateTimeLocalValue("2026-12-01T08:00", "America/New_York").toISOString()).toBe(
      "2026-12-01T13:00:00.000Z",
    );
  });

  it("格式錯誤的 datetime-local 拋錯", () => {
    expect(() => fromDateTimeLocalValue("2026/10/21 07:30", "Asia/Taipei")).toThrow();
  });

  it("當地日期的星期與時刻", () => {
    expect(weekdayOfLocalDate("2026-10-25")).toBe(0);
    expect(toLocalTime("2026-10-20T23:30:00Z", "Asia/Taipei")).toBe("07:30");
  });
});
