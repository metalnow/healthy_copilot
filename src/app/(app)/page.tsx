import Link from "next/link";
import { ComingSoon } from "@/components/coming-soon";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { formatMl, formatObservation, formatShortDate } from "@/lib/format";
import { OBSERVATION_LABELS } from "@/lib/labels";
import { countDone } from "@/lib/medication/checklist";
import {
  evaluateBloodPressure,
  evaluateHeartRate,
  type SafetyAlert,
} from "@/lib/safety/rules";
import { OBSERVATION_TYPES, type ObservationType } from "@/lib/schemas/observation";
import { toLocalDate } from "@/lib/time";
import { listDrinksForDate, listFoodForDate } from "@/server/food";
import { getChecklist } from "@/server/medications";
import {
  latestObservations,
  listObservationsForDate,
  type ObservationRow,
} from "@/server/observations";
import { MedicationChecklist } from "./_components/medication-checklist";
import { SafetyBanner } from "./_components/safety-banner";
import { buildEntries, TodayEntries } from "./_components/today-entries";

const QUICK_ADD = [
  { href: "/log/measurement/weight", label: "體重" },
  { href: "/log/measurement/blood_pressure", label: "血壓" },
  { href: "/log/measurement/heart_rate", label: "心率" },
  { href: "/log/measurement/waist", label: "腰圍" },
  { href: "/log/food", label: "飲食" },
  { href: "/log/drink", label: "飲水" },
] as const;

/** 依今天最新一筆血壓 / 心率套用固定規則 */
function todaySafetyAlerts(todayObservations: ObservationRow[]): SafetyAlert[] {
  const latestOf = (type: ObservationType) => todayObservations.find((o) => o.type === type);
  const bp = latestOf("blood_pressure");
  const hr = latestOf("heart_rate");
  return [
    bp &&
      evaluateBloodPressure({
        systolic: Number(bp.values.systolic),
        diastolic: Number(bp.values.diastolic),
      }),
    hr && evaluateHeartRate(Number(hr.values.bpm)),
  ].filter((a): a is SafetyAlert => Boolean(a));
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

  const [latest, todayObservations, food, drinks, checklist] = await Promise.all([
    latestObservations(db, user.id),
    listObservationsForDate(db, user.id, today),
    listFoodForDate(db, user.id, today),
    listDrinksForDate(db, user.id, today),
    getChecklist(db, user.id, today),
  ]);

  const waterMl = drinks.reduce((sum, d) => sum + (d.waterMl ?? 0), 0);
  const otherDrinks = drinks.filter((d) => d.drinkType !== "water").length;
  const medsDone = countDone(checklist);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">今日</h1>
        <p className="text-sm text-muted">{today}</p>
      </div>

      <SafetyBanner alerts={todaySafetyAlerts(todayObservations)} />

      <nav aria-label="快速記錄" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {QUICK_ADD.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg border border-border bg-surface px-2 py-2 text-center text-sm hover:border-accent"
          >
            ＋ {item.label}
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
          <MetricCard label="步數" value="Sprint 5 開放" muted />
          <MetricCard label="睡眠" value="Sprint 5 開放" muted />
        </dl>
      </section>

      <MedicationChecklist items={checklist} localDate={today} timeZone={user.timezone} />

      <TodayEntries entries={buildEntries(todayObservations, food, drinks)} timeZone={user.timezone} />

      <ComingSoon
        title="AI 洞察"
        sprint="Sprint 6"
        items={["每週最多 3 則趨勢觀察", "Today Focus：1–3 個行動"]}
      />
    </div>
  );
}
