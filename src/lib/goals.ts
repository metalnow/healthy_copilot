import { LAB_CATALOG } from "@/lib/labs/catalog";

export type GoalMetric = { code: string; name: string; unit: string | null; kind: "lab" | "behavior" };

/** 行為指標：由近 7 天的紀錄計算 */
export const BEHAVIOR_METRICS: GoalMetric[] = [
  { code: "STEPS_AVG_7D", name: "近 7 天平均步數", unit: "步", kind: "behavior" },
  { code: "SLEEP_HOURS_AVG_7D", name: "近 7 天平均睡眠", unit: "小時", kind: "behavior" },
  { code: "EXERCISE_MIN_7D", name: "近 7 天運動時間", unit: "分鐘", kind: "behavior" },
];

export const GOAL_METRICS: GoalMetric[] = [
  ...LAB_CATALOG.filter((d) => d.goal).map((d) => ({ code: d.code, name: d.name, unit: d.unit, kind: "lab" as const })),
  ...BEHAVIOR_METRICS,
];

export function getGoalMetric(code: string) {
  return GOAL_METRICS.find((m) => m.code === code);
}

/** 由基準值與目標值推導方向 */
export function goalDirection(baseline: number | null, target: number | null): "increase" | "decrease" | "maintain" {
  if (baseline === null || target === null || baseline === target) return "maintain";
  return target > baseline ? "increase" : "decrease";
}

/** 進度 0–1：從基準值往目標值走了多少；無法計算時為 null */
export function goalProgress(
  goal: { baselineValue: number | null; targetValue: number | null; direction: "increase" | "decrease" | "maintain" },
  current: number | null,
): number | null {
  const { baselineValue: baseline, targetValue: target } = goal;
  if (current === null || target === null) return null;
  if (goal.direction === "maintain" || baseline === null || baseline === target) {
    return baseline === null ? null : Math.abs(current - target) <= Math.abs(target) * 0.02 ? 1 : 0;
  }
  return Math.min(1, Math.max(0, (current - baseline) / (target - baseline)));
}

export function isGoalReached(
  goal: { targetValue: number | null; direction: "increase" | "decrease" | "maintain" },
  current: number | null,
) {
  if (current === null || goal.targetValue === null) return false;
  if (goal.direction === "decrease") return current <= goal.targetValue;
  if (goal.direction === "increase") return current >= goal.targetValue;
  return Math.abs(current - goal.targetValue) <= Math.abs(goal.targetValue) * 0.02;
}
