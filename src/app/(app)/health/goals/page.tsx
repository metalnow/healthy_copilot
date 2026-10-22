import type { Metadata } from "next";
import { ConfirmButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { getGoalMetric, goalProgress, isGoalReached } from "@/lib/goals";
import { toLocalDate } from "@/lib/time";
import { currentMetricValue, listGoals } from "@/server/health";
import { saveGoal, updateGoal } from "../actions";
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

export default async function GoalsPage() {
  const user = await requireUser();
  const db = await getDb();
  const goals = await listGoals(db, user.id);
  const currents = await Promise.all(goals.map((g) => currentMetricValue(db, user, g.metric)));

  return (
    <div className="space-y-6">
      <PageHeader title="健康目標" backHref="/health" backLabel="健康" />

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

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">新增目標</h2>
        <GoalForm action={saveGoal} today={toLocalDate(new Date(), user.timezone)} />
      </section>
    </div>
  );
}
