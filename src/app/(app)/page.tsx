import Link from "next/link";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { formatMl, formatObservation, formatShortDate } from "@/lib/format";
import { OBSERVATION_LABELS } from "@/lib/labels";
import { countDone } from "@/lib/medication/checklist";
import {
  evaluateBloodPressure,
  evaluateHeartRate,
  evaluateSymptom,
  type SafetyAlert,
} from "@/lib/safety/rules";
import { OBSERVATION_TYPES, type ObservationType } from "@/lib/schemas/observation";
import { formatDuration, sleepDurationMin } from "@/lib/sleep";
import { toLocalDate } from "@/lib/time";
import { listDrinksForDate, listFoodForDate } from "@/server/food";
import { lifestyleForRange, recentSymptoms, type SymptomRow } from "@/server/lifestyle";
import { getChecklist } from "@/server/medications";
import {
  latestObservations,
  listObservationsForDate,
  type ObservationRow,
} from "@/server/observations";
import { ReviewOutputSchema } from "@/lib/ai/schemas";
import { deterministicInsights } from "@/lib/insights/aggregate";
import { latestWeeklyReview } from "@/server/ai/reviews";
import { addDays, summariesWithPrevious } from "@/server/insights";
import { getTimeline } from "@/server/timeline";
import { EntryList } from "./_components/entry-list";
import { MedicationChecklist } from "./_components/medication-checklist";
import { SafetyBanner } from "./_components/safety-banner";

const QUICK_ADD = [
  { href: "/log/measurement/weight", label: "體重" },
  { href: "/log/measurement/blood_pressure", label: "血壓" },
  { href: "/log/measurement/heart_rate", label: "心率" },
  { href: "/log/measurement/waist", label: "腰圍" },
  { href: "/log/food", label: "飲食" },
  { href: "/log/drink", label: "飲水" },
  { href: "/log/sleep", label: "睡眠" },
  { href: "/log/activity", label: "步數" },
  { href: "/log/exercise", label: "運動" },
  { href: "/log/symptom", label: "症狀" },
] as const;

const AI_MODES = [
  { mode: "photo", label: "📷 拍餐點" },
  { mode: "voice", label: "🎤 說一句" },
  { mode: "text", label: "⌨️ 打一句" },
] as const;

const STEP_GOAL = 8000;

/** 固定規則：今天最新一筆血壓 / 心率，以及最近 24 小時的症狀 */
function safetyAlerts(todayObservations: ObservationRow[], symptoms: SymptomRow[]): SafetyAlert[] {
  const latestOf = (type: ObservationType) => todayObservations.find((o) => o.type === type);
  const bp = latestOf("blood_pressure");
  const hr = latestOf("heart_rate");
  const alerts = [
    bp &&
      evaluateBloodPressure({
        systolic: Number(bp.values.systolic),
        diastolic: Number(bp.values.diastolic),
      }),
    hr && evaluateHeartRate(Number(hr.values.bpm)),
    ...symptoms.map((s) => evaluateSymptom(s)),
  ].filter((a): a is SafetyAlert => Boolean(a));
  // 同一規則只顯示一次，最嚴重的在前
  const order = { emergency: 0, urgent: 1, caution: 2 };
  return [...new Map(alerts.map((a) => [a.ruleId, a])).values()].sort((a, b) => order[a.level] - order[b.level]);
}

function MetricCard({
  label,
  value,
  sub,
  href,
  muted,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  muted?: boolean;
}) {
  const body = (
    <>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-lg font-medium ${muted ? "text-muted" : ""}`}>{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </>
  );
  const className = "block h-full rounded-xl border border-border bg-surface p-3";
  return (
    <div>
      {href ? (
        <Link href={href} className={`${className} hover:border-accent`}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </div>
  );
}

export default async function TodayPage() {
  const user = await requireUser();
  const today = toLocalDate(new Date(), user.timezone);
  const db = await getDb();

  const [latest, todayObservations, food, drinks, checklist, lifestyle, symptoms, entries, week, review] = await Promise.all([
    latestObservations(db, user.id),
    listObservationsForDate(db, user.id, today),
    listFoodForDate(db, user.id, today),
    listDrinksForDate(db, user.id, today),
    getChecklist(db, user.id, today),
    lifestyleForRange(db, user.id, today, today),
    recentSymptoms(db, user.id),
    getTimeline(db, user, today, today),
    summariesWithPrevious(db, user, addDays(today, -6), today),
    latestWeeklyReview(db, user.id),
  ]);

  const recentSleep = [...week.currentInput.sleep]
    .sort((a, b) => b.wakeAt.localeCompare(a.wakeAt))
    .map(sleepDurationMin)
    .filter((m): m is number => m !== null);
  const insights = deterministicInsights(week.current, week.previous, recentSleep);
  // 只採用最近兩週內的週回顧
  const reviewOutput =
    review && review.periodEnd >= addDays(today, -13) ? ReviewOutputSchema.safeParse(review.output) : null;
  const focus = reviewOutput?.success ? reviewOutput.data.nextFocus.slice(0, 3) : [];

  const waterMl = drinks.reduce((sum, d) => sum + (d.waterMl ?? 0), 0);
  const otherDrinks = drinks.filter((d) => d.drinkType !== "water").length;
  const medsDone = countDone(checklist);
  const steps = Math.max(0, ...lifestyle.activity.map((a) => a.steps ?? 0));
  const lastNight = lifestyle.sleep[0];
  const sleepMin = lastNight ? sleepDurationMin(lastNight) : null;
  const exerciseMin = lifestyle.exercise.reduce((sum, e) => sum + e.durationMin, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">今日</h1>
        <p className="text-sm text-muted">{today}</p>
      </div>

      <SafetyBanner alerts={safetyAlerts(todayObservations, symptoms)} />

      <nav aria-label="AI 快速記錄" className="grid grid-cols-3 gap-2">
        {AI_MODES.map((item) => (
          <Link
            key={item.mode}
            href={`/log/ai?mode=${item.mode}`}
            className="rounded-xl bg-accent px-2 py-3 text-center text-sm font-medium text-accent-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <nav aria-label="快速記錄" className="grid grid-cols-5 gap-2">
        {QUICK_ADD.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg border border-border bg-surface px-1 py-2 text-center text-sm hover:border-accent"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <section aria-labelledby="today-metrics">
        <h2 id="today-metrics" className="sr-only">
          今日數據
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {OBSERVATION_TYPES.map((type) => {
            const row = latest[type];
            const isToday = row?.localDate === today;
            return (
              <MetricCard
                key={type}
                label={OBSERVATION_LABELS[type]}
                href={`/log/measurement/${type}`}
                value={row ? formatObservation(type, row.values) : "尚未記錄"}
                sub={row && !isToday ? `上次 ${formatShortDate(row.localDate)}` : undefined}
                muted={!isToday}
              />
            );
          })}
          <MetricCard
            label="步數"
            href="/log/activity"
            value={steps > 0 ? `${steps.toLocaleString("zh-TW")} / ${STEP_GOAL.toLocaleString("zh-TW")}` : "尚未記錄"}
            sub={exerciseMin > 0 ? `運動 ${Math.round(exerciseMin)} 分鐘` : undefined}
            muted={steps === 0}
          />
          <MetricCard
            label="睡眠"
            href="/log/sleep"
            value={lastNight ? formatDuration(sleepMin) : "尚未記錄"}
            muted={!lastNight}
          />
          <MetricCard
            label="飲食"
            href="/log/food"
            value={food.length > 0 ? `${food.length} 筆` : "尚未記錄"}
            muted={food.length === 0}
          />
          <MetricCard
            label="飲水"
            href="/log/drink"
            value={waterMl > 0 ? `水 ${formatMl(waterMl)}` : "尚未記錄"}
            sub={otherDrinks > 0 ? `其他飲料 ${otherDrinks} 杯` : undefined}
            muted={drinks.length === 0}
          />
          <MetricCard
            label="用藥"
            href="/medications"
            value={checklist.length > 0 ? `${medsDone} / ${checklist.length}` : "今日無"}
            muted={checklist.length === 0}
          />
        </dl>
      </section>

      <MedicationChecklist items={checklist} localDate={today} timeZone={user.timezone} />

      <section aria-labelledby="entries-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="entries-heading" className="font-medium">
            今日紀錄
          </h2>
          <Link href="/timeline" className="text-sm text-accent">
            時間軸
          </Link>
        </div>
        {entries.length === 0 ? <p className="text-sm text-muted">今天還沒有紀錄。</p> : <EntryList items={entries} />}
      </section>

      <section aria-labelledby="focus-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="focus-heading" className="font-medium">
            洞察與今日重點
          </h2>
          <Link href="/insights" className="text-sm text-accent">
            更多
          </Link>
        </div>
        {insights.length > 0 && (
          <ul className="space-y-2">
            {insights.map((insight) => (
              <li key={insight.id} className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
                {insight.tone === "positive" ? "👍 " : insight.tone === "attention" ? "⚠ " : "• "}
                {insight.text}
              </li>
            ))}
          </ul>
        )}
        {focus.length > 0 ? (
          <ol className="space-y-2">
            {focus.map((f, i) => (
              <li key={f.action} className="rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
                <span className="font-medium">
                  {i + 1}. {f.action}
                </span>
                <span className="block text-muted">{f.why}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">
            {insights.length === 0 ? "持續記錄幾天後，這裡會出現趨勢觀察。" : ""}
            產生<Link href="/insights" className="text-accent">週回顧</Link>後，這裡會顯示 1–3 個本週重點行動。
          </p>
        )}
      </section>
    </div>
  );
}
