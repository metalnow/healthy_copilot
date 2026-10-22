import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { aiReviews, users } from "@/db/schema";
import { AiError } from "@/lib/ai/openrouter";
import { reviewSystemPrompt } from "@/lib/ai/prompts";
import { ReviewOutputSchema, type ReviewOutput } from "@/lib/ai/schemas";
import { generateStructured } from "@/lib/ai/structured";
import { getGoalMetric, goalProgress } from "@/lib/goals";
import { getLabDefinition } from "@/lib/labs/catalog";
import { monthBounds, weekBounds } from "@/lib/insights/periods";
import { evaluateBloodPressure, evaluateSymptom } from "@/lib/safety/rules";
import { toLocalDate } from "@/lib/time";
import type { JobMessage } from "@/jobs/types";
import { currentMetricValue, listGoals, listLabs, summarizeLabs } from "@/server/health";
import { summariesWithPrevious } from "@/server/insights";
import { openRouterConfig } from "./config";
import { getModelProfile } from "./model-profiles";

type Env = Pick<CloudflareEnv, "AI_QUEUE" | "OPENROUTER_API_KEY" | "OPENROUTER_BASE_URL">;
export type ReviewPeriod = "weekly" | "monthly";
export type ReviewRow = typeof aiReviews.$inferSelect;

/** 建立（或重新產生）一份回顧並排入佇列 */
export async function requestReview(
  db: Db,
  env: Env,
  user: { id: string; timezone: string },
  period: ReviewPeriod,
  trigger: "manual" | "scheduled",
) {
  if (!env.OPENROUTER_API_KEY) throw new AiError("not_configured");
  const today = toLocalDate(new Date(), user.timezone);
  const bounds = period === "weekly" ? weekBounds(today) : monthBounds(today);
  const profile = await getModelProfile(db, period === "weekly" ? "reasoning" : "medical_summary");

  const [existing] = await db
    .select({ id: aiReviews.id, status: aiReviews.status })
    .from(aiReviews)
    .where(and(eq(aiReviews.userId, user.id), eq(aiReviews.period, period), eq(aiReviews.periodStart, bounds.start)))
    .limit(1);
  if (existing?.status === "pending") return existing.id;

  const values = {
    periodEnd: bounds.end,
    modelId: profile.modelId,
    inputSummary: {},
    output: null,
    status: "pending" as const,
    trigger,
    usage: null,
    error: null,
    durationMs: null,
    completedAt: null,
  };
  const [row] = await db
    .insert(aiReviews)
    .values({ userId: user.id, period, periodStart: bounds.start, ...values })
    .onConflictDoUpdate({ target: [aiReviews.userId, aiReviews.period, aiReviews.periodStart], set: values })
    .returning({ id: aiReviews.id });

  await env.AI_QUEUE.send({ kind: "review", userId: user.id, reviewId: row.id } satisfies JobMessage);
  return row.id;
}

/** 送給模型的輸入：只有彙總數字，不含任何身分資料或原始紀錄 */
async function buildReviewInput(db: Db, user: { id: string; timezone: string }, review: ReviewRow) {
  const { currentInput, current, previous } = await summariesWithPrevious(db, user, review.periodStart, review.periodEnd);

  const labs = summarizeLabs(await listLabs(db, user.id))
    .filter(({ latest }) => latest.value !== null || latest.textValue)
    .slice(0, 30)
    .map(({ latest, previous: prev }) => ({
      item: latest.code === "OTHER" ? latest.displayName : (getLabDefinition(latest.code)?.name ?? latest.code),
      value: latest.value ?? latest.textValue,
      unit: latest.unit,
      date: latest.measuredAt,
      flag: latest.abnormalFlag,
      previous: prev?.value ?? null,
    }));

  const goals = await listGoals(db, user.id);
  const goalSummaries = await Promise.all(
    goals
      .filter((g) => g.status === "active")
      .map(async (goal) => {
        const currentValue = (await currentMetricValue(db, user, goal.metric))?.value ?? null;
        const progress = goalProgress(goal, currentValue);
        return {
          metric: getGoalMetric(goal.metric)?.name ?? goal.metric,
          baseline: goal.baselineValue,
          target: goal.targetValue,
          current: currentValue,
          progressPercent: progress === null ? null : Math.round(progress * 100),
          targetDate: goal.targetDate,
        };
      }),
  );

  const notableEvents = [
    ...currentInput.observations
      .filter((o) => o.type === "blood_pressure")
      .map((o) => ({ date: o.localDate, alert: evaluateBloodPressure({ systolic: Number(o.values.systolic), diastolic: Number(o.values.diastolic) }) })),
    ...currentInput.symptoms.map((s) => ({ date: s.localDate, alert: evaluateSymptom(s) })),
  ]
    .filter((e) => e.alert)
    .map((e) => ({ date: e.date, event: e.alert!.title }));

  return { period: review.period, current, previous, baselineLabs: labs, goals: goalSummaries, notableEvents };
}

const RETRYABLE: AiError["code"][] = ["timeout", "provider_error", "rate_limited"];

/** 佇列 consumer：產生回顧 */
export async function runReview(db: Db, env: Env, job: { userId: string; reviewId: string }, attempt: number) {
  const [review] = await db
    .select()
    .from(aiReviews)
    .where(and(eq(aiReviews.id, job.reviewId), eq(aiReviews.userId, job.userId)))
    .limit(1);
  if (!review || review.status !== "pending") return "done" as const;
  const [user] = await db.select({ id: users.id, timezone: users.timezone }).from(users).where(eq(users.id, job.userId)).limit(1);
  if (!user) return "done" as const;

  const started = Date.now();
  try {
    const input = await buildReviewInput(db, user, review);
    const profile = await getModelProfile(db, review.period === "weekly" ? "reasoning" : "medical_summary");
    const response = await generateStructured(openRouterConfig(env), {
      model: profile.modelId,
      maxTokens: profile.maxTokens,
      system: reviewSystemPrompt(review.period === "weekly" ? "weekly" : "monthly"),
      user: JSON.stringify(input),
      schema: ReviewOutputSchema,
      schemaName: "health_review",
    });
    const output: ReviewOutput = {
      ...response.data,
      wins: response.data.wins.slice(0, 4),
      concerns: response.data.concerns.slice(0, 4),
      patterns: response.data.patterns.slice(0, 4),
      nextFocus: response.data.nextFocus.slice(0, 3),
    };
    await db
      .update(aiReviews)
      .set({
        status: "succeeded",
        inputSummary: input,
        output,
        modelId: response.model,
        usage: { steps: [{ profile: profile.key, modelId: response.model, ...response.usage }], totalCost: response.usage.cost ?? 0 },
        durationMs: Date.now() - started,
        completedAt: new Date(),
      })
      .where(eq(aiReviews.id, review.id));
    return "done" as const;
  } catch (error) {
    if (error instanceof AiError && RETRYABLE.includes(error.code) && attempt < 3) return "retry" as const;
    await db
      .update(aiReviews)
      .set({
        status: "failed",
        error: error instanceof AiError ? error.code : "unexpected",
        durationMs: Date.now() - started,
        completedAt: new Date(),
      })
      .where(eq(aiReviews.id, review.id));
    return "done" as const;
  }
}

export async function listReviews(db: Db, userId: string, limit = 20) {
  return db
    .select()
    .from(aiReviews)
    .where(eq(aiReviews.userId, userId))
    .orderBy(desc(aiReviews.periodStart), desc(aiReviews.createdAt))
    .limit(limit);
}

export async function getReview(db: Db, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(aiReviews)
    .where(and(eq(aiReviews.id, id), eq(aiReviews.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** 最新一份成功的週回顧（給「今日」頁的 Today Focus） */
export async function latestWeeklyReview(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(aiReviews)
    .where(and(eq(aiReviews.userId, userId), eq(aiReviews.period, "weekly"), eq(aiReviews.status, "succeeded")))
    .orderBy(desc(aiReviews.periodStart))
    .limit(1);
  return row ?? null;
}
