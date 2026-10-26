// 依健檢報告（最新值、參考範圍、歷年趨勢）產生建議目標。固定規則，不經 AI；使用者確認後才會建立目標。

import { getLabDefinition } from "@/lib/labs/catalog";

type Sex = "male" | "female" | "other" | null;

/** 一般成人建議值：報告沒有參考範圍時使用（數值為代碼表的標準單位） */
const GUIDELINES: Record<string, (sex: Sex) => { min?: number; max?: number }> = {
  WAIST: (sex) => ({ max: sex === "female" ? 80 : 90 }),
  BMI: () => ({ min: 18.5, max: 24 }),
  BODY_FAT: (sex) => ({ max: sex === "female" ? 30 : 25 }),
  VISCERAL_FAT: () => ({ max: 9 }),
  SBP: () => ({ max: 130 }),
  DBP: () => ({ max: 80 }),
  GLU_AC: () => ({ max: 99 }),
  HBA1C: () => ({ max: 5.6 }),
  TG: () => ({ max: 150 }),
  TCHO: () => ({ max: 200 }),
  LDL: () => ({ max: 130 }),
  HDL: (sex) => ({ min: sex === "female" ? 50 : 40 }),
  UA: (sex) => ({ max: sex === "female" ? 6 : 7 }),
};

/** 會建議目標的項目，以及只在哪個方向偏離時才建議（例如 HDL 只在偏低時） */
const SUGGESTABLE: Record<string, "high" | "low"> = {
  WEIGHT: "high",
  WAIST: "high",
  BODY_FAT: "high",
  VISCERAL_FAT: "high",
  SBP: "high",
  DBP: "high",
  GLU_AC: "high",
  HBA1C: "high",
  TG: "high",
  TCHO: "high",
  LDL: "high",
  HDL: "low",
  UA: "high",
  GGT: "high",
  ALT: "high",
  AST: "high",
};

/** 每天可以自己量的項目較快看到變化，目標期間較短 */
const DAILY_MEASURABLE = new Set(["WEIGHT", "WAIST", "SBP", "DBP"]);

export type LabHistoryPoint = {
  code: string;
  value: number | null;
  measuredAt: string;
  referenceMin: number | null;
  referenceMax: number | null;
};

export type GoalSuggestion = {
  metric: string;
  name: string;
  unit: string | null;
  baseline: number;
  target: number;
  targetDate: string;
  direction: "decrease" | "increase";
  /** 歷年數值（舊到新），例如 2022 302 → 2024 253 */
  history: { date: string; value: number }[];
  reason: string;
  /** 排序用：偏離程度，越大越優先 */
  severity: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

function addMonths(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function trendText(history: { date: string; value: number }[], unit: string | null) {
  if (history.length < 2) return "";
  const [prev, last] = history.slice(-2);
  const diff = round1(last.value - prev.value);
  if (diff === 0) return `，和 ${prev.date.slice(0, 4)} 年相同`;
  return `，比 ${prev.date.slice(0, 4)} 年${diff > 0 ? "上升" : "下降"} ${Math.abs(diff)}${unit ? ` ${unit}` : ""}`;
}

export function suggestGoals(input: {
  labs: LabHistoryPoint[];
  /** 各指標目前的最新值（含每日量測），沒有時用報告最新值 */
  current: Record<string, number | undefined>;
  profile: { sex: Sex; heightCm: number | null } | null;
  /** 已有進行中目標的指標不再建議 */
  activeMetrics: Set<string>;
  today: string;
  limit?: number;
}): GoalSuggestion[] {
  const sex = input.profile?.sex ?? null;
  const suggestions: GoalSuggestion[] = [];

  const byCode = new Map<string, LabHistoryPoint[]>();
  for (const row of input.labs) {
    if (row.value === null || !(row.code in SUGGESTABLE)) continue;
    byCode.set(row.code, [...(byCode.get(row.code) ?? []), row]);
  }

  for (const [code, rows] of byCode) {
    if (input.activeMetrics.has(code)) continue;
    const def = getLabDefinition(code);
    if (!def) continue;
    const sorted = [...rows].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    // 同一天多筆只取最後一筆
    const history = [...new Map(sorted.map((r) => [r.measuredAt, { date: r.measuredAt, value: r.value! }])).values()];
    const latest = sorted.at(-1)!;
    const baseline = input.current[code] ?? latest.value!;
    const unit = def.unit;
    const months = DAILY_MEASURABLE.has(code) ? 6 : 12;
    // 檢驗項目通常在下次健檢才會再驗：最新報告的一年後，至少三個月後
    const fromReport = addMonths(latest.measuredAt, 12);
    const minDate = addMonths(input.today, 3);
    const targetDate = DAILY_MEASURABLE.has(code) ? addMonths(input.today, months) : fromReport > minDate ? fromReport : minDate;

    if (code === "WEIGHT") {
      // 體重：BMI 超過 24 時，先以減重 5% 為階段目標（不低於 BMI 24 對應的體重）
      const height = input.profile?.heightCm ?? null;
      if (!height) continue;
      const bmi = baseline / (height / 100) ** 2;
      if (bmi <= 24) continue;
      const healthyMax = round1(24 * (height / 100) ** 2);
      const target = Math.max(healthyMax, round1(baseline * 0.95));
      suggestions.push({
        metric: code,
        name: def.name,
        unit,
        baseline,
        target,
        targetDate,
        direction: "decrease",
        history,
        reason: `BMI ${round1(bmi)}，高於 24${trendText(history, unit)}。先以 6 個月減重 5% 為階段目標；BMI 24 約為 ${healthyMax} kg。`,
        severity: (bmi - 24) / 24,
      });
      continue;
    }

    const reference = { min: latest.referenceMin ?? undefined, max: latest.referenceMax ?? undefined };
    const bound = reference.min !== undefined || reference.max !== undefined ? reference : (GUIDELINES[code]?.(sex) ?? {});
    const source = bound === reference ? "報告參考範圍" : "一般成人建議值";
    const side = SUGGESTABLE[code];

    if (side === "high" && bound.max !== undefined && baseline > bound.max) {
      suggestions.push({
        metric: code,
        name: def.name,
        unit,
        baseline,
        target: round1(bound.max),
        targetDate,
        direction: "decrease",
        history,
        reason: `最新 ${baseline}${unit ? ` ${unit}` : ""}，高於${source}上限 ${round1(bound.max)}${trendText(history, unit)}。`,
        severity: (baseline - bound.max) / bound.max,
      });
    } else if (side === "low" && bound.min !== undefined && baseline < bound.min) {
      suggestions.push({
        metric: code,
        name: def.name,
        unit,
        baseline,
        target: round1(bound.min),
        targetDate,
        direction: "increase",
        history,
        reason: `最新 ${baseline}${unit ? ` ${unit}` : ""}，低於${source}下限 ${round1(bound.min)}${trendText(history, unit)}。`,
        severity: (bound.min - baseline) / bound.min,
      });
    }
  }

  // 趨勢變差的稍微優先
  const worsening = (s: GoalSuggestion) => {
    const [prev, last] = s.history.slice(-2);
    if (!prev || !last) return 0;
    return (s.direction === "decrease" ? last.value > prev.value : last.value < prev.value) ? 0.1 : 0;
  };
  return suggestions
    .sort((a, b) => b.severity + worsening(b) - (a.severity + worsening(a)))
    .slice(0, input.limit ?? 5);
}
