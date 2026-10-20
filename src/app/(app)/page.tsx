import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/auth/dal";
import { toLocalDate } from "@/lib/time";

const TODAY_METRICS = [
  { label: "體重", unit: "kg" },
  { label: "血壓", unit: "mmHg" },
  { label: "心率", unit: "bpm" },
  { label: "步數", unit: "步" },
  { label: "睡眠", unit: "" },
  { label: "飲食", unit: "餐" },
  { label: "用藥", unit: "" },
] as const;

export default async function TodayPage() {
  const user = await requireUser();
  const today = toLocalDate(new Date(), user.timezone);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">今日</h1>
        <p className="text-sm text-muted">{today}</p>
      </div>

      <section aria-labelledby="today-metrics">
        <h2 id="today-metrics" className="sr-only">
          今日數據
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TODAY_METRICS.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-border bg-surface p-3">
              <dt className="text-xs text-muted">{metric.label}</dt>
              <dd className="mt-1 text-lg font-medium text-muted">尚未記錄</dd>
            </div>
          ))}
        </dl>
      </section>

      <ComingSoon
        title="AI 洞察"
        sprint="Sprint 6"
        items={["每週最多 3 則趨勢觀察", "Today Focus：1–3 個行動"]}
      />
    </div>
  );
}
