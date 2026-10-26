import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdviceList } from "@/components/advice-list";
import { ConfirmButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { getGoalMetric, goalProgress, isGoalReached } from "@/lib/goals";
import { adviceForMetric } from "@/lib/health-advice";
import { toLocalDate } from "@/lib/time";
import { currentMetricValue, goalSuggestions, listGoals, recentIntake } from "@/server/health";
import { adoptGoal, saveGoal, updateGoal } from "../actions";
import { GoalForm } from "./goal-form";

export const metadata: Metadata = { title: "健康目標" };

const STATUS_LABELS = { active: "進行中", achieved: "已達成", paused: "暫停" } as const;
const DIRECTION_SYMBOL = { increase: "≥", decrease: "≤", maintain: "≈" } as const;

function GoalAction({ id, action, label }: { id: string; action: string; label: string }) {
  return (
    <form action={updateGoal}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" className="text-xs text-muted">
        {label}
      </button>
    </form>
  );
}

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function GoalsPage({ searchParams }: PageProps<"/health/goals">) {
  const user = await requireUser();
  const db = await getDb();
  const [goals, suggestions, intake] = await Promise.all([
    listGoals(db, user.id),
    goalSuggestions(db, user),
    recentIntake(db, user),
  ]);
  const currents = await Promise.all(goals.map((g) => currentMetricValue(db, user, g.metric)));
  const query = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader title="健康目標" backHref="/health" backLabel="健康" />

      {suggestions.length > 0 && (
        <section aria-labelledby="suggest-heading" className="space-y-3">
          <h2 id="suggest-heading" className="flex items-center gap-1.5 font-semibold">
            <Lightbulb aria-hidden className="size-4 text-accent" />
            依健檢報告的建議目標
          </h2>
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.metric} className="space-y-2 rounded-2xl border border-accent/40 bg-accent/5 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{s.name}</h3>
                  <span className="text-sm font-medium">
                    {DIRECTION_SYMBOL[s.direction]} {s.target} {s.unit ?? ""}
                  </span>
                </div>
                <p className="text-sm">{s.reason}</p>
                {s.history.length > 1 && (
                  <p className="text-xs text-muted">
                    歷年：{s.history.map((h) => `${h.date.slice(0, 4)} ${h.value}`).join(" → ")}
                  </p>
                )}
                <p className="text-xs text-muted">
                  基準 {s.baseline} {s.unit ?? ""}・建議在 {s.targetDate} 前
                </p>
                {adviceForMetric(s.metric) && <AdviceList advice={adviceForMetric(s.metric)!} intake={intake} />}
                <div className="flex items-center gap-4 pt-1">
                  <form action={adoptGoal}>
                    <input type="hidden" name="metric" value={s.metric} />
                    <input type="hidden" name="baselineValue" value={s.baseline} />
                    <input type="hidden" name="targetValue" value={s.target} />
                    <input type="hidden" name="targetDate" value={s.targetDate} />
                    <button type="submit" className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground active:scale-95">
                      採用
                    </button>
                  </form>
                  <Link
                    href={`/health/goals?${new URLSearchParams({ metric: s.metric, target: String(s.target), baseline: String(s.baseline), date: s.targetDate })}#new-goal`}
                    className="text-sm text-accent"
                  >
                    自己調整
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            建議目標依健檢報告的參考範圍（沒有時用一般成人建議值）與歷年數值計算，僅供參考；適合你的目標請與醫師討論。
          </p>
        </section>
      )}

      {goals.length > 0 && (
        <ul className="space-y-3">
          {goals.map((goal, i) => {
            const metric = getGoalMetric(goal.metric);
            const current = currents[i];
            const progress = goalProgress(goal, current?.value ?? null);
            const reached = isGoalReached(goal, current?.value ?? null);
            return (
              <li key={goal.id} className={`space-y-2 rounded-xl border border-border bg-surface p-4 ${goal.status === "paused" ? "opacity-60" : ""}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{metric?.name ?? goal.metric}</h2>
                  <span className="text-xs text-muted">{STATUS_LABELS[goal.status]}</span>
                </div>
                <p className="text-sm">
                  {goal.baselineValue ?? "—"} → {DIRECTION_SYMBOL[goal.direction]} {goal.targetValue} {goal.unit ?? ""}
                  {goal.targetDate && <span className="text-muted">（{goal.targetDate} 前）</span>}
                </p>
                <p className="text-sm text-muted">
                  目前：{current ? `${current.value} ${goal.unit ?? ""}（${current.date}）` : "尚無資料"}
                  {reached && <span className="ml-2 text-accent">已達標 🎉</span>}
                </p>
                {goal.status === "active" && adviceForMetric(goal.metric) && (
                  <AdviceList advice={adviceForMetric(goal.metric)!} intake={intake} />
                )}
                {progress !== null && (
                  <div
                    className="h-2 overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-valuenow={Math.round(progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="目標進度"
                  >
                    <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
                <div className="flex gap-4">
                  {goal.status !== "achieved" && reached && <GoalAction id={goal.id} action="achieved" label="標記為已達成" />}
                  {goal.status === "active" ? (
                    <GoalAction id={goal.id} action="paused" label="暫停" />
                  ) : (
                    <GoalAction id={goal.id} action="active" label="恢復進行" />
                  )}
                  <form action={updateGoal}>
                    <input type="hidden" name="id" value={goal.id} />
                    <input type="hidden" name="action" value="delete" />
                    <ConfirmButton message="確定要刪除這個目標嗎？" className="text-xs text-muted">
                      刪除
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section id="new-goal" className="scroll-mt-20 space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">新增目標</h2>
        <GoalForm
          key={param(query.metric) ?? "new"}
          action={saveGoal}
          today={toLocalDate(new Date(), user.timezone)}
          defaults={{
            metric: param(query.metric),
            targetValue: param(query.target),
            baselineValue: param(query.baseline),
            targetDate: param(query.date),
          }}
        />
      </section>
    </div>
  );
}
