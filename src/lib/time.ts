// 時區工具：所有每日 / 每週彙總都以使用者當地日期（local_date）為準。

export const DEFAULT_TIMEZONE = "Asia/Taipei";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** 將時間點轉成指定時區的當地日期 YYYY-MM-DD */
export function toLocalDate(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(instant)}`);
  }
  // en-CA 的日期格式即為 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 指定時區當下的星期（0 = 週日）與小時，供 cron dispatcher 判斷是否到了排程時間 */
export function localWeekdayAndHour(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(instant);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { weekday: weekdays.indexOf(weekday ?? ""), hour };
}

/** 事件欄位：occurredAt（UTC ISO）+ localDate + timezone */
export function eventTimeFields(instant: Date | string, timeZone: string) {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return {
    occurredAt: date.toISOString(),
    localDate: toLocalDate(date, timeZone),
    timezone: timeZone,
  };
}
