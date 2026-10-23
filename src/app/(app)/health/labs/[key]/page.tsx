import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { TrendChart } from "@/components/trend-chart";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { labDisplayName } from "@/lib/labs/catalog";
import { FLAG_CLASSES, FLAG_LABELS, formatLabValue, formatReference } from "@/lib/labs/format";
import { labHistory } from "@/server/health";
import { removeLab } from "../../actions";

export const metadata: Metadata = { title: "檢驗紀錄" };

const SOURCE_LABELS = { hospital_report: "報告", manual: "手動", ai_extract: "報告（AI 擷取）" } as const;

export default async function LabHistoryPage({ params }: PageProps<"/health/labs/[key]">) {
  const key = decodeURIComponent((await params).key);
  const user = await requireUser();
  const history = await labHistory(await getDb(), user.id, key);
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
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {[...history].reverse().map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block">{row.measuredAt}</span>
              <span className="text-xs text-muted">
                {SOURCE_LABELS[row.source]}
                {formatReference(row) && `・參考 ${formatReference(row)}`}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-medium">{formatLabValue(row)}</span>
              <span className={`text-xs ${FLAG_CLASSES[row.abnormalFlag ?? "unknown"]}`}>
                {FLAG_LABELS[row.abnormalFlag ?? "unknown"]}
              </span>
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
