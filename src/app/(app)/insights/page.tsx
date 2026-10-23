import type { Metadata } from "next";
import Link from "next/link";
import { TrendChart } from "@/components/trend-chart";
import { getDb, getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { dailySeries, deterministicInsights, type PeriodSummary } from "@/lib/insights/aggregate";
import { SYMPTOM_LABELS } from "@/lib/labels";
import { sleepDurationMin } from "@/lib/sleep";
import { toLocalDate } from "@/lib/time";
import { listReviews } from "@/server/ai/reviews";
import { addDays, summariesWithPrevious } from "@/server/insights";
import { generateReview } from "./actions";

export const metadata: Metadata = { title: "洞察" };

const RANGES = [7, 30, 90] as const;

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "尚未設定 OpenRouter API Key，無法產生 AI 回顧。",
};

const fmt = (v: number | null | undefined, suffix = "") => (v === null || v === undefined ? "—" : `${v.toLocaleString("zh-TW")}${suffix}`);

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-base font-medium">{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

function Domain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-medium text-muted">{title}</h3>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</dl>
    </section>
  );
}

function delta(current: number | null, previous: number | null, unit = "") {
  if (current === null || previous === null || current === previous) return undefined;
  const diff = Math.round((current - previous) * 10) / 10;
  return `前一期 ${previous.toLocaleString("zh-TW")}${unit}（${diff > 0 ? "+" : ""}${diff.toLocaleString("zh-TW")}）`;
}

function Domains({ s, p }: { s: PeriodSummary; p: PeriodSummary }) {
  const topSymptoms = Object.entries(s.symptoms.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type, n]) => `${SYMPTOM_LABELS[type] ?? type} ${n}`)
    .join("、");
  return (
    <div className="space-y-3">
      <Domain title="代謝">
        <Stat label="體重變化" value={fmt(s.weight.change, " kg")} sub={s.weight.last !== null ? `最新 ${s.weight.last} kg` : undefined} />
        <Stat label="腰圍" value={fmt(s.waist.last, " cm")} sub={s.waist.change !== null ? `變化 ${s.waist.change} cm` : undefined} />
        <Stat label="每日熱量（含飲料，估算）" value={fmt(s.food.avgEstimatedKcalPerDay, " kcal")} />
        <Stat label="晚餐平均時間" value={s.food.avgDinnerTime ?? "—"} sub={s.food.lateDinners ? `20:00 後 ${s.food.lateDinners} 次` : undefined} />
        <Stat
          label="平均飽足感（1–5）"
          value={fmt(s.food.avgSatiety)}
          sub={s.food.satietyLogged ? `${s.food.satietyLogged} 餐有記錄` : undefined}
        />
      </Domain>
      <Domain title="心血管">
        <Stat
          label="血壓平均"
          value={s.bloodPressure.avgSystolic !== null ? `${s.bloodPressure.avgSystolic}/${s.bloodPressure.avgDiastolic}` : "—"}
          sub={delta(s.bloodPressure.avgSystolic, p.bloodPressure.avgSystolic)}
        />
        <Stat label="≥ 140/90 次數" value={fmt(s.bloodPressure.readingsAtOrAbove140_90)} sub={`共 ${s.bloodPressure.readings} 次量測`} />
        <Stat label="心率平均" value={fmt(s.heartRate.avg, " bpm")} sub={delta(s.heartRate.avg, p.heartRate.avg)} />
        <Stat label="飲酒天數" value={fmt(s.drinks.alcoholDays, " 天")} sub={s.drinks.alcoholGTotal ? `酒精 ${s.drinks.alcoholGTotal} g` : undefined} />
      </Domain>
      <Domain title="睡眠">
        <Stat label="平均睡眠" value={fmt(s.sleep.avgHours, " 小時")} sub={delta(s.sleep.avgHours, p.sleep.avgHours)} />
        <Stat label="少於 7 小時" value={fmt(s.sleep.nightsUnder7h, " 晚")} sub={`共 ${s.sleep.nights} 晚`} />
        <Stat label="主觀品質" value={fmt(s.sleep.avgQuality, " / 5")} />
        <Stat label="咖啡因" value={fmt(s.drinks.caffeineMgTotal, " mg")} />
      </Domain>
      <Domain title="活動">
        <Stat label="平均步數" value={fmt(s.activity.avgSteps)} sub={delta(s.activity.avgSteps, p.activity.avgSteps)} />
        <Stat label="達 8,000 步" value={fmt(s.activity.daysAtStepGoal, " 天")} />
        <Stat label="運動" value={`${s.activity.exerciseSessions} 次`} sub={`${s.activity.exerciseMinutes} 分鐘`} />
        <Stat label="飯後運動" value={fmt(s.activity.afterMealExerciseDays, " 天")} />
      </Domain>
      <Domain title="遵從度與症狀">
        <Stat
          label="用藥完成率"
          value={s.medication.adherencePercent !== null ? `${s.medication.adherencePercent}%` : "—"}
          sub={s.medication.expected ? `${s.medication.taken + s.medication.late} / ${s.medication.expected}` : undefined}
        />
        <Stat label="飲食紀錄" value={`${s.food.daysLogged} 天`} sub={`${s.food.mealsLogged} 筆`} />
        <Stat label="症狀" value={`${s.symptoms.count} 次`} sub={topSymptoms || undefined} />
        <Stat label="嚴重症狀" value={fmt(s.symptoms.severeCount, " 次")} />
      </Domain>
    </div>
  );
}

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const user = await requireUser();
  const params = await searchParams;
  const days = RANGES.find((r) => String(r) === params.range) ?? 30;
  const today = toLocalDate(new Date(), user.timezone);
  const from = addDays(today, -(days - 1));
  const db = await getDb();

  const [{ currentInput, current, previous }, reviews, env] = await Promise.all([
    summariesWithPrevious(db, user, from, today),
    listReviews(db, user.id, 10),
    getEnv(),
  ]);
  const series = dailySeries(currentInput);
  const recentSleep = [...currentInput.sleep]
    .sort((a, b) => b.wakeAt.localeCompare(a.wakeAt))
    .map(sleepDurationMin)
    .filter((m): m is number => m !== null);
  const insights = deterministicInsights(current, previous, recentSleep);
  const error = typeof params.error === "string" ? ERROR_MESSAGES[params.error] : undefined;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">洞察</h1>

      <nav aria-label="期間" className="flex gap-2">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/insights?range=${r}`}
            aria-current={r === days ? "page" : undefined}
            className="rounded-full border border-border px-3 py-1 text-sm aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
          >
            近 {r} 天
          </Link>
        ))}
      </nav>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">AI 回顧</h2>
        {error && <p className="text-sm text-warning">{error}</p>}
        <div className="flex gap-2">
          {(["weekly", "monthly"] as const).map((period) => (
            <form key={period} action={generateReview}>
              <input type="hidden" name="period" value={period} />
              <button
                type="submit"
                disabled={!env.OPENROUTER_API_KEY}
                className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground disabled:opacity-60"
              >
                產生{period === "weekly" ? "本週" : "本月"}回顧
              </button>
            </form>
          ))}
        </div>
        <p className="text-xs text-muted">每週日 21:00 會自動產生週回顧。</p>
        {reviews.length > 0 && (
          <ul className="divide-y divide-border">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link href={`/insights/reviews/${r.id}`} className="flex justify-between gap-3 py-2 text-sm">
                  <span>
                    {r.period === "weekly" ? "週回顧" : "月回顧"} {r.periodStart} – {r.periodEnd}
                  </span>
                  <span className="text-muted">
                    {r.status === "pending" ? "產生中" : r.status === "failed" ? "失敗" : "查看"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {insights.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">觀察</h2>
          <ul className="space-y-2">
            {insights.map((insight) => (
              <li key={insight.id} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                {insight.tone === "positive" ? "👍 " : insight.tone === "attention" ? "⚠ " : "• "}
                {insight.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">趨勢</h2>
        <TrendChart title="體重" unit="kg" series={[{ name: "體重", color: "series-1", points: series.weight }]} />
        <TrendChart
          title="血壓（每日平均）"
          unit="mmHg"
          digits={0}
          series={[
            { name: "收縮壓", color: "series-1", points: series.systolic },
            { name: "舒張壓", color: "series-2", points: series.diastolic },
          ]}
        />
        <TrendChart title="心率（每日平均）" unit="bpm" digits={0} series={[{ name: "心率", color: "series-1", points: series.heartRate }]} />
        <TrendChart
          title="睡眠"
          unit="小時"
          series={[{ name: "睡眠", color: "series-1", points: series.sleepHours }]}
          reference={{ value: 7, label: "7 小時" }}
        />
        <TrendChart
          title="步數"
          unit="步"
          digits={0}
          series={[{ name: "步數", color: "series-1", points: series.steps }]}
          reference={{ value: 8000, label: "8,000" }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">
          各面向摘要<span className="ml-2 text-xs font-normal text-muted">與前 {days} 天比較</span>
        </h2>
        <Domains s={current} p={previous} />
      </section>

      <p className="text-xs text-muted">
        不提供單一「健康分數」。各面向分開呈現，相關不代表因果；Correlation Explorer 與 N-of-1 實驗為後續功能。
      </p>
    </div>
  );
}
