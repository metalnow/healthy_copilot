import { describe, expect, it } from "vitest";
import { isBackupDue } from "./scheduled";

describe("isBackupDue", () => {
  it.each([
    ["daily", { weekday: 4, hour: 3 }, 15, true],
    ["daily", { weekday: 4, hour: 4 }, 15, false],
    ["weekly", { weekday: 1, hour: 3 }, 15, true],
    ["weekly", { weekday: 2, hour: 3 }, 15, false],
    ["monthly", { weekday: 2, hour: 3 }, 1, true],
    ["monthly", { weekday: 2, hour: 3 }, 2, false],
    ["off", { weekday: 1, hour: 3 }, 1, false],
  ])("%s %o day %i → %s", (frequency, local, day, expected) => {
    expect(isBackupDue(frequency, local, day)).toBe(expected);
  });
});
