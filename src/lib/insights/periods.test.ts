import { describe, expect, it } from "vitest";
import { monthBounds, previousMonthBounds, weekBounds } from "./periods";

describe("periods", () => {
  it("週一到今天", () => {
    expect(weekBounds("2026-10-21")).toEqual({ start: "2026-10-19", end: "2026-10-21" }); // 週三
    expect(weekBounds("2026-10-25")).toEqual({ start: "2026-10-19", end: "2026-10-25" }); // 週日
    expect(weekBounds("2026-10-19")).toEqual({ start: "2026-10-19", end: "2026-10-19" }); // 週一
  });
  it("月份", () => {
    expect(monthBounds("2026-10-21")).toEqual({ start: "2026-10-01", end: "2026-10-21" });
    expect(previousMonthBounds("2026-03-05")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});
