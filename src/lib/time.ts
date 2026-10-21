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

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** 指定時區在該時間點相對 UTC 的位移（毫秒） */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** 時間點 → `<input type="datetime-local">` 的值（YYYY-MM-DDTHH:mm，使用者時區） */
export function toDateTimeLocalValue(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** `<input type="datetime-local">` 的值（使用者時區）→ 時間點 */
export function fromDateTimeLocalValue(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid datetime-local value: ${value}`);
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const wallClockAsUtc = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  // 先用當下位移估算，再以估算結果的位移校正一次（處理夏令時間切換）
  let result = wallClockAsUtc - timeZoneOffsetMs(new Date(wallClockAsUtc), timeZone);
  result = wallClockAsUtc - timeZoneOffsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** 當地日期的星期（0 = 週日） */
export function weekdayOfLocalDate(localDate: string): number {
  return new Date(`${localDate}T00:00:00Z`).getUTCDay();
}

/** 時間點在指定時區的 HH:mm */
export function toLocalTime(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return toDateTimeLocalValue(date, timeZone).slice(11);
}
