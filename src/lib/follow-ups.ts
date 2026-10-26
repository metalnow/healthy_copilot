// 健檢後的追蹤事項：報告建議的複檢 / 回診（AI 擷取、使用者確認），
// 以及描述性檢查（超音波等）的異常發現（固定規則提示，使用者採用後才建立）。

import { z } from "zod";
import type { LabExtraction } from "@/lib/ai/schemas";
import { adviceForFinding, looksAbnormal } from "@/lib/health-advice";
import { getLabDefinition, labDisplayName } from "@/lib/labs/catalog";

export const FOLLOW_UP_STATUS_LABELS = {
  open: "待安排",
  scheduled: "已預約",
  done: "已完成",
  dismissed: "不追蹤",
} as const;

export const FollowUpDraftSchema = z.object({
  finding: z.string().trim().min(1, "請輸入要追蹤的發現").max(200),
  action: z.string().trim().min(1, "請輸入建議的作法").max(300),
  department: z.string().trim().max(50).optional(),
  intervalMonths: z.number().int().min(1).max(60).optional(),
  labKey: z.string().max(150).optional(),
});
export type FollowUpDraft = z.infer<typeof FollowUpDraftSchema>;

export function followUpDraftsFromExtraction(extraction: Pick<LabExtraction, "followUps">): FollowUpDraft[] {
  return (extraction.followUps ?? [])
    .filter((f) => f.finding.trim() !== "" && f.action.trim() !== "")
    .map((f) => ({
      finding: f.finding.trim().slice(0, 200),
      action: f.action.trim().slice(0, 300),
      department: f.department?.trim().slice(0, 50) || undefined,
      intervalMonths:
        f.intervalMonths && f.intervalMonths >= 1 ? Math.min(60, Math.round(f.intervalMonths)) : undefined,
    }));
}

export function addMonths(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** 建議的追蹤日期：報告日期加上建議間隔 */
export function dueDateFor(reportDate: string | null, intervalMonths: number | undefined) {
  return reportDate && intervalMonths ? addMonths(reportDate, intervalMonths) : null;
}

type LabLike = {
  code: string;
  displayName: string;
  value: number | null;
  textValue: string | null;
  abnormalFlag: "low" | "high" | "critical" | "normal" | "unknown" | null;
  measuredAt: string;
  sourceDocumentId: string | null;
};

export type FindingSuggestion = {
  labKey: string;
  name: string;
  finding: string;
  action: string;
  foundAt: string;
  sourceDocumentId: string | null;
};

/** 影像與描述性的項目：結果文字本身就是發現 */
const DESCRIPTIVE_CODES = new Set(["ULTRASOUND", "OTHER", "CV_RISK", "BMD_T"]);
/** 過敏原不算需要複檢的項目 */
const SKIP_CODES = new Set(["IGE_SPECIFIC", "IGE_TOTAL"]);

function isFlagged(flag: LabLike["abnormalFlag"]) {
  return flag === "high" || flag === "low" || flag === "critical";
}

/**
 * 各項目最新一筆中，需要追蹤卻還沒有追蹤事項的發現：
 * - 描述性結果（超音波等）被標示異常，或文字看起來是異常發現
 * - 文字結果（B 肝表面抗原陽性等）或腫瘤標記被標示異常
 */
export function suggestFindingFollowUps(
  latestByKey: { key: string; latest: LabLike }[],
  existing: { labKey: string | null; foundAt: string | null; sourceDocumentId?: string | null; finding?: string }[],
): FindingSuggestion[] {
  const covered = new Set(existing.map((f) => `${f.labKey}|${f.foundAt}`));
  // 報告建議（AI 擷取）沒有關聯項目：同一份報告的追蹤事項提到這個項目時，視為已涵蓋
  const reportFindings = existing.filter((f) => f.sourceDocumentId && f.finding);
  const suggestions: FindingSuggestion[] = [];
  for (const { key, latest } of latestByKey) {
    if (SKIP_CODES.has(latest.code) || covered.has(`${key}|${latest.measuredAt}`)) continue;
    const text = latest.textValue?.trim() ?? "";
    const descriptive = DESCRIPTIVE_CODES.has(latest.code) && latest.value === null && text !== "";
    const tumor = getLabDefinition(latest.code)?.category === "tumor";
    const needs =
      latest.abnormalFlag !== "normal" &&
      ((descriptive && (isFlagged(latest.abnormalFlag) || looksAbnormal(text))) ||
        (!descriptive && (latest.value === null || tumor) && isFlagged(latest.abnormalFlag)));
    if (!needs) continue;

    const name = labDisplayName(latest);
    if (
      latest.sourceDocumentId &&
      reportFindings.some((f) => f.sourceDocumentId === latest.sourceDocumentId && f.finding!.includes(name))
    ) {
      continue;
    }
    const advice = adviceForFinding(text);
    suggestions.push({
      labKey: key,
      name,
      finding: text ? `${name}：${text}`.slice(0, 200) : `${name}異常`,
      action: advice[0]?.followUp ?? (tumor ? "回診與醫師討論是否需要複檢。" : "與醫師討論是否需要追蹤或進一步檢查。"),
      foundAt: latest.measuredAt,
      sourceDocumentId: latest.sourceDocumentId,
    });
  }
  return suggestions;
}
