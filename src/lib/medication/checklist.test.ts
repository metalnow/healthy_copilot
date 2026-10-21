import { describe, expect, it } from "vitest";
import {
  buildChecklist,
  countDone,
  isScheduledOn,
  scheduledInstant,
  takenStatus,
  timeSlotOf,
  type ScheduleForChecklist,
} from "./checklist";

const base: ScheduleForChecklist = {
  scheduleId: "s1",
  medicationId: "m1",
  name: "Vitamin D",
  dose: 1,
  unit: "顆",
  timing: "after_meal",
  localTime: "08:00",
  daysOfWeek: null,
  startDate: null,
  endDate: null,
};

describe("medication checklist", () => {
  it("依時刻分時段", () => {
    expect(timeSlotOf("07:30")).toBe("morning");
    expect(timeSlotOf("12:00")).toBe("noon");
    expect(timeSlotOf("15:00")).toBe("afternoon");
    expect(timeSlotOf("19:00")).toBe("evening");
    expect(timeSlotOf("22:30")).toBe("bedtime");
  });

  it("依星期與起訖日判斷當天是否需要服用", () => {
    // 2026-10-21 是週三
    expect(isScheduledOn(base, "2026-10-21")).toBe(true);
    expect(isScheduledOn({ ...base, daysOfWeek: [1, 3, 5] }, "2026-10-21")).toBe(true);
    expect(isScheduledOn({ ...base, daysOfWeek: [0, 6] }, "2026-10-21")).toBe(false);
    expect(isScheduledOn({ ...base, startDate: "2026-10-22" }, "2026-10-21")).toBe(false);
    expect(isScheduledOn({ ...base, endDate: "2026-10-20" }, "2026-10-21")).toBe(false);
  });

  it("超過預定時間 2 小時才服用算延遲", () => {
    const scheduled = scheduledInstant("2026-10-21", "08:00", "Asia/Taipei");
    expect(scheduled.toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(takenStatus(scheduled, new Date("2026-10-21T01:59:00Z"))).toBe("taken");
    expect(takenStatus(scheduled, new Date("2026-10-21T02:01:00Z"))).toBe("late");
  });

  it("組出當天清單並對應已有的紀錄", () => {
    const items = buildChecklist(
      [
        { ...base, scheduleId: "s2", name: "Fish Oil", localTime: "21:30" },
        base,
        { ...base, scheduleId: "s3", daysOfWeek: [0] },
      ],
      [{ id: "e1", scheduleId: "s1", status: "taken", takenAt: "2026-10-21T00:05:00Z" }],
      "2026-10-21",
    );
    expect(items.map((i) => i.scheduleId)).toEqual(["s1", "s2"]);
    expect(items[0].event?.id).toBe("e1");
    expect(items[1].slot).toBe("bedtime");
    expect(countDone(items)).toBe(1);
  });
});
