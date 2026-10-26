import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdviceList } from "@/components/advice-list";
import { ConfirmButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { TrendChart } from "@/components/trend-chart";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { labDisplayName } from "@/lib/labs/catalog";
import { adviceForFinding, adviceForMetric } from "@/lib/health-advice";
import { formatLabValue, formatReference, isLongLabText, labFlag } from "@/lib/labs/format";
import { findingSuggestions, listFollowUps } from "@/server/follow-ups";
import { labHistory, recentIntake } from "@/server/health";
import { adoptFollowUp, removeLab } from "../../actions";

export const metadata: Metadata = { title: "檢驗紀錄" };

const SOURCE_LABELS = { hospital_report: "報告", manual: "手動", ai_extract: "報告（AI 擷取）" } as const;

export default async function LabHistoryPage({ params }: PageProps<"/health/labs/[key]">) {
  const key = decodeURIComponent((await params).key);
  const user = await requireUser();
  const db = await getDb();
  const history = await labHistory(db, user.id, key);
  if (history.length === 0) notFound();

  const latest = history[history.length - 1];
  // 同一天多筆時取最後一筆；只畫標準單位相同的數值
  const numeric = [
    ...new Map(
      history
        .filter((r) => r.value !== null && r.unit === latest.unit)
        .map((r) => [r.measuredAt, { date: r.measuredAt, value: r.value! }]),
    ).values(),
  ];
  const name = labDisplayName(latest);

  // 最新一筆異常時，給改善行動；描述性結果依內容（脂肪肝、結石…）找對應建議
  const abnormal = latest.abnormalFlag === "high" || latest.abnormalFlag === "low" || latest.abnormalFlag === "critical";
  const metricAdvice = abnormal ? adviceForMetric(latest.code) : null;
  const advice = [...(metricAdvice ? [metricAdvice] : []), ...(latest.textValue ? adviceForFinding(latest.textValue) : [])];
  const [intake, followUps] = await Promise.all([
    advice.length > 0 ? recentIntake(db, user) : undefined,
    listFollowUps(db, user.id),
  ]);
  const suggestion = (await findingSuggestions(db, user.id, followUps)).find((s) => s.labKey === key);
  const tracked = followUps.filter((f) => f.labKey === key && (f.status === "open" || f.status === "scheduled"));

  return (
    <div className="space-y-6">
      <PageHeader title={name} backHref="/health" backLabel="健康" />
      {numeric.length >= 2 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <TrendChart
            title={name}
            unit={latest.unit ?? undefined}
            digits={2}
            series={[{ name, color: "series-1", points: numeric }]}
            reference={
              latest.referenceMax !== null
                ? { value: latest.referenceMax, label: `上限 ${latest.referenceMax}` }
                : latest.referenceMin !== null
                  ? { value: latest.referenceMin, label: `下限 ${latest.referenceMin}` }
                  : undefined
            }
          />
        </div>
      )}
      {advice.map((a) => (
        <AdviceList key={a.topic} advice={a} intake={intake} open />
      ))}

      {tracked.length > 0 && (
        <Link href="/health/follow-ups" className="block rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
          追蹤中：{tracked.map((f) => f.action).join("；")} ›
        </Link>
      )}
      {suggestion && (
        <form action={adoptFollowUp} className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
          <input type="hidden" name="finding" value={suggestion.finding} />
          <input type="hidden" name="action" value={suggestion.action} />
          <input type="hidden" name="labKey" value={suggestion.labKey} />
          <input type="hidden" name="foundAt" value={suggestion.foundAt} />
          <input type="hidden" name="sourceDocumentId" value={suggestion.sourceDocumentId ?? ""} />
          <input type="hidden" name="source" value="finding" />
          <span>{suggestion.action}</span>
          <button type="submit" className="shrink-0 rounded-full bg-accent px-3 py-1.5 font-medium text-accent-foreground">
            加入追蹤
          </button>
        </form>
      )}

      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {[...history].reverse().map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block">{row.measuredAt}</span>
              <span className="text-xs text-muted">
                {SOURCE_LABELS[row.source]}
                {formatReference(row) && `・參考 ${formatReference(row)}`}
              </span>
              {isLongLabText(row) && <span className="mt-1 block">{row.textValue}</span>}
            </span>
            <span className="max-w-[50%] text-right">
              {!isLongLabText(row) && <span className="block font-medium break-words">{formatLabValue(row)}</span>}
              <span className={`text-xs ${labFlag(row).className}`}>{labFlag(row).label}</span>
            </span>
            <form action={removeLab}>
              <input type="hidden" name="id" value={row.id} />
              <ConfirmButton
                message={`確定要刪除 ${row.measuredAt} 的這筆紀錄嗎？`}
                aria-label={`刪除 ${row.measuredAt} 的紀錄`}
                className="px-1 text-xs text-muted"
              >
                刪除
              </ConfirmButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
