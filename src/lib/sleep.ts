import { fromDateTimeLocalValue, toLocalDate } from "@/lib/time";

/** 兩個時間點之間的分鐘數；不合理（≤0 或 ≥ 24 小時）回傳 null */
export function minutesBetween(start: Date | string | null | undefined, end: Date | string | null | undefined) {
  if (!start || !end) return null;
  const minutes = (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
  return minutes > 0 && minutes < 24 * 60 ? Math.round(minutes) : null;
}

/** 睡眠時數：優先用量測到的總睡眠，否則用（入睡或上床）到起床扣掉清醒時間 */
export function sleepDurationMin(session: {
  totalSleepMin: number | null;
  sleepStartAt: string | null;
  bedtimeAt: string | null;
  wakeAt: string;
  awakeMin?: number | null;
}) {
  if (session.totalSleepMin !== null) return session.totalSleepMin;
  const span = minutesBetween(session.sleepStartAt ?? session.bedtimeAt, session.wakeAt);
  return span === null ? null : Math.max(0, span - (session.awakeMin ?? 0));
}

export function formatDuration(minutes: number | null) {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分`;
}

/**
 * 截圖上的「入睡 HH:mm / 起床 HH:mm」→ 時間點。
 * 起床日期預設為今天；入睡時刻晚於起床時刻表示前一天入睡。
 */
export function resolveSleepTimes(
  input: { wakeDate?: string | null; sleepStart: string | null; sleepEnd: string | null },
  now: Date,
  timeZone: string,
) {
  const valid = (t: string | null) => (t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null);
  const end = valid(input.sleepEnd);
  const start = valid(input.sleepStart);
  if (!end) return null;

  const wakeDate =
    input.wakeDate && /^\d{4}-\d{2}-\d{2}$/.test(input.wakeDate) ? input.wakeDate : toLocalDate(now, timeZone);
  const wake = fromDateTimeLocalValue(`${wakeDate}T${end}`, timeZone);
  let sleepStart: Date | null = null;
  if (start) {
    sleepStart = fromDateTimeLocalValue(`${wakeDate}T${start}`, timeZone);
    if (sleepStart >= wake) sleepStart = new Date(sleepStart.getTime() - 86_400_000);
  }
  return { wakeAt: wake, sleepStartAt: sleepStart };
}
