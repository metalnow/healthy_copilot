import {
  Activity,
  Camera,
  Dumbbell,
  FileText,
  Footprints,
  GlassWater,
  HeartPulse,
  Keyboard,
  Mic,
  Moon,
  Pill,
  Plus,
  Ruler,
  Scale,
  Sparkles,
  Thermometer,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { formatMl, formatObservation, formatShortDate } from "@/lib/format";
import { DRINK_TYPE_LABELS, OBSERVATION_LABELS } from "@/lib/labels";
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

const AI_MODES: { mode: string; label: string; icon: LucideIcon }[] = [
  { mode: "photo", label: "拍照", icon: Camera },
  { mode: "voice", label: "說一句", icon: Mic },
  { mode: "text", label: "打一句", icon: Keyboard },
];

const OBSERVATION_ICONS: Record<ObservationType, LucideIcon> = {
  weight: Scale,
  blood_pressure: Activity,
  heart_rate: HeartPulse,
  waist: Ruler,
};

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

/** 今日磚塊：點一下就進入記錄（或管理）畫面；沒有今日資料時顯示「記錄」 */
function Tile({
  label,
  icon: Icon,
  href,
  value,
  sub,
  stale,
  cta = "記錄",
}: {
  label: string;
  icon: LucideIcon;
  href: string;
  value?: string;
  sub?: string;
  /** 顯示的是過去的數值（灰色） */
  stale?: boolean;
  cta?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex h-full min-h-24 flex-col justify-between gap-2 rounded-2xl border border-border bg-surface p-3 transition active:scale-[0.97] active:bg-accent/5"
      >
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Icon aria-hidden className={`size-4 ${value && !stale ? "text-accent" : ""}`} />
          {label}
        </span>
        {value ? (
          <span className="leading-tight">
            <span className={`block truncate text-base font-semibold tabular-nums ${stale ? "text-muted" : ""}`}>{value}</span>
            {sub && <span className="block truncate text-[11px] text-muted">{sub}</span>}
          </span>
        ) : (
          <span className="leading-tight">
            <span className="flex items-center gap-0.5 text-sm text-accent">
              <Plus aria-hidden className="size-4" />
              {cta}
            </span>
            {sub && <span className="block truncate text-[11px] text-muted">{sub}</span>}
          </span>
        )}
      </Link>
    </li>
  );
}

/** 2026-10-22 → 10月22日 星期四 */
function longDate(localDate: string) {
  const [y, m, d] = localDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("zh-TW", { weekday: "long", timeZone: "UTC" });
  return `${m}月${d}日 ${weekday}`;
}

/** 磚塊上的短數值：血壓不帶單位，例如「128/82」 */
function shortObservation(type: ObservationType, values: Record<string, number | string>) {
  if (type === "blood_pressure") return `${values.systolic}/${values.diastolic}`;
  return formatObservation(type, values);
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
  // 水以外的飲料依類型計數，例如「咖啡 1・含糖飲料 2」
  const otherDrinkCounts = new Map<string, number>();
  for (const d of drinks) {
    if (d.drinkType === "water") continue;
    const label = DRINK_TYPE_LABELS[d.drinkType];
    otherDrinkCounts.set(label, (otherDrinkCounts.get(label) ?? 0) + 1);
  }
  const otherDrinks = [...otherDrinkCounts].map(([label, n]) => `${label} ${n}`).join("・");
  const medsDone = countDone(checklist);
  const steps = Math.max(0, ...lifestyle.activity.map((a) => a.steps ?? 0));
  const lastNight = lifestyle.sleep[0];
  const sleepMin = lastNight ? sleepDurationMin(lastNight) : null;
  const exerciseMin = lifestyle.exercise.reduce((sum, e) => sum + e.durationMin, 0);

  const alerts = safetyAlerts(todayObservations, symptoms);
  const todaySymptoms = lifestyle.symptoms.length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{longDate(today)}</p>
        <h1 className="text-2xl font-bold tracking-tight">今日</h1>
      </div>

      <SafetyBanner alerts={alerts} />

      <section aria-labelledby="ai-heading" className="rounded-2xl bg-accent p-4 text-accent-foreground">
        <h2 id="ai-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles aria-hidden className="size-4" />
          AI 快速記錄
        </h2>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {AI_MODES.map(({ mode, label, icon: Icon }) => (
            <li key={mode}>
              <Link
                href={`/log/ai?mode=${mode}`}
                className="flex flex-col items-center gap-1 rounded-xl bg-accent-foreground/15 py-3 text-sm font-medium transition active:scale-95 active:bg-accent-foreground/25"
              >
                <Icon aria-hidden className="size-6" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="today-metrics" className="space-y-3">
        <h2 id="today-metrics" className="font-semibold">
          今日數據
        </h2>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {OBSERVATION_TYPES.map((type) => {
            const row = latest[type];
            const isToday = row?.localDate === today;
            return (
              <Tile
                key={type}
                label={OBSERVATION_LABELS[type]}
                icon={OBSERVATION_ICONS[type]}
                href={`/log/measurement/${type}`}
                value={row ? shortObservation(type, row.values) : undefined}
                sub={row && !isToday ? `上次 ${formatShortDate(row.localDate)}` : undefined}
                stale={!isToday}
              />
            );
          })}
          <Tile
            label="步數"
            icon={Footprints}
            href="/log/activity"
            value={steps > 0 ? steps.toLocaleString("zh-TW") : undefined}
            sub={steps > 0 ? `目標 ${STEP_GOAL.toLocaleString("zh-TW")}` : undefined}
          />
          <Tile label="睡眠" icon={Moon} href="/log/sleep" value={lastNight ? formatDuration(sleepMin) : undefined} />
          <Tile label="飲食" icon={Utensils} href="/log/food" value={food.length > 0 ? `${food.length} 筆` : undefined} />
          <Tile
            label="飲料"
            icon={GlassWater}
            href="/log/drink"
            value={waterMl > 0 ? `水 ${formatMl(waterMl)}` : drinks.length > 0 ? `${drinks.length} 杯` : undefined}
            sub={otherDrinks || undefined}
          />
          <Tile
            label="運動"
            icon={Dumbbell}
            href="/log/exercise"
            value={exerciseMin > 0 ? `${Math.round(exerciseMin)} 分鐘` : undefined}
          />
          <Tile
            label="症狀"
            icon={Thermometer}
            href="/log/symptom"
            value={todaySymptoms > 0 ? `${todaySymptoms} 筆` : undefined}
          />
          <Tile
            label="用藥"
            icon={Pill}
            href="/medications"
            value={checklist.length > 0 ? `${medsDone} / ${checklist.length}` : undefined}
            sub={checklist.length === 0 ? "管理藥物" : undefined}
          />
          <Tile label="檢驗報告" icon={FileText} href="/health/reports/new" cta="上傳" />
        </ul>
      </section>

      <MedicationChecklist items={checklist} localDate={today} timeZone={user.timezone} />

      <section aria-labelledby="entries-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="entries-heading" className="font-semibold">
            今日紀錄
          </h2>
          <Link href="/timeline" className="text-sm text-accent">
            全部
          </Link>
        </div>
        {entries.length === 0 ? <p className="text-sm text-muted">今天還沒有紀錄。</p> : <EntryList items={entries} />}
      </section>

      <section aria-labelledby="focus-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="focus-heading" className="font-semibold">
            洞察與今日重點
          </h2>
          <Link href="/insights" className="text-sm text-accent">
            更多
          </Link>
        </div>
        {insights.length > 0 && (
          <ul className="space-y-2">
            {insights.map((insight) => (
              <li key={insight.id} className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
                {insight.tone === "positive" ? "👍 " : insight.tone === "attention" ? "⚠ " : "• "}
                {insight.text}
              </li>
            ))}
          </ul>
        )}
        {focus.length > 0 ? (
          <ol className="space-y-2">
            {focus.map((f, i) => (
              <li key={f.action} className="rounded-2xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
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
