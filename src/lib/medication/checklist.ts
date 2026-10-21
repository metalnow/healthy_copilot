import type { MEDICATION_EVENT_STATUSES, MEDICATION_TIMINGS } from "@/lib/enums";
import { fromDateTimeLocalValue, weekdayOfLocalDate } from "@/lib/time";

type MedicationStatus = (typeof MEDICATION_EVENT_STATUSES)[number];

export type ScheduleForChecklist = {
  scheduleId: string;
  medicationId: string;
  name: string;
  dose: number | null;
  unit: string | null;
  timing: (typeof MEDICATION_TIMINGS)[number] | null;
  localTime: string;
  daysOfWeek: number[] | null;
  startDate: string | null;
  endDate: string | null;
};

export type EventForChecklist = {
  id: string;
  scheduleId: string | null;
  status: MedicationStatus;
  takenAt: string | null;
};

export type ChecklistItem = ScheduleForChecklist & {
  slot: TimeSlot;
  event: EventForChecklist | null;
};

export const TIME_SLOTS = ["morning", "noon", "afternoon", "evening", "bedtime"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  morning: "早上",
  noon: "中午",
  afternoon: "下午",
  evening: "晚上",
  bedtime: "睡前",
};

/** 超過預定時間多久才服用算「延遲」 */
export const LATE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export function timeSlotOf(localTime: string): TimeSlot {
  const hour = Number(localTime.slice(0, 2));
  if (hour < 11) return "morning";
  if (hour < 14) return "noon";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "bedtime";
}

export function isScheduledOn(schedule: ScheduleForChecklist, localDate: string): boolean {
  if (schedule.startDate && localDate < schedule.startDate) return false;
  if (schedule.endDate && localDate > schedule.endDate) return false;
  if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) return true;
  return schedule.daysOfWeek.includes(weekdayOfLocalDate(localDate));
}

/** 預定服用時間點 */
export function scheduledInstant(localDate: string, localTime: string, timeZone: string): Date {
  return fromDateTimeLocalValue(`${localDate}T${localTime}`, timeZone);
}

export function takenStatus(scheduledAt: Date, takenAt: Date): "taken" | "late" {
  return takenAt.getTime() - scheduledAt.getTime() > LATE_THRESHOLD_MS ? "late" : "taken";
}

export function buildChecklist(
  schedules: ScheduleForChecklist[],
  events: EventForChecklist[],
  localDate: string,
): ChecklistItem[] {
  const eventBySchedule = new Map(
    events.filter((e) => e.scheduleId).map((e) => [e.scheduleId as string, e]),
  );
  return schedules
    .filter((s) => isScheduledOn(s, localDate))
    .map((s) => ({
      ...s,
      slot: timeSlotOf(s.localTime),
      event: eventBySchedule.get(s.scheduleId) ?? null,
    }))
    .sort((a, b) => a.localTime.localeCompare(b.localTime) || a.name.localeCompare(b.name));
}

/** 已完成（服用、延遲服用或略過）的項目數 */
export function countDone(items: ChecklistItem[]) {
  return items.filter((i) => i.event && i.event.status !== "unknown").length;
}
