import { weekdayOfLocalDate } from "@/lib/time";

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 週一到週日；結束日不超過今天 */
export function weekBounds(today: string) {
  const offset = (weekdayOfLocalDate(today) + 6) % 7;
  const start = addDays(today, -offset);
  return { start, end: today };
}

/** 當月 1 日到今天 */
export function monthBounds(today: string) {
  return { start: `${today.slice(0, 8)}01`, end: today };
}

/** 上一個完整月份 */
export function previousMonthBounds(today: string) {
  const firstOfThisMonth = `${today.slice(0, 8)}01`;
  const end = addDays(firstOfThisMonth, -1);
  return { start: `${end.slice(0, 8)}01`, end };
}
