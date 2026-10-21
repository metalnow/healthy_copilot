import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import { requestReview } from "@/server/ai/reviews";
import { localWeekdayAndHour } from "@/lib/time";

/** 週回顧在使用者當地週日 21:00 產生 */
const WEEKLY_REVIEW = { weekday: 0, hour: 21 } as const;

/**
 * 每小時由 Cron Trigger 呼叫：依各使用者時區判斷是否到了回顧 / 備份時間，
 * 到期的工作送進 Queue 處理，cron 本身不做耗時工作。
 */
export async function handleScheduled(controller: ScheduledController, env: CloudflareEnv) {
  const now = new Date(controller.scheduledTime);
  const db = createDb(env.DB);
  const rows = await db.select({ id: users.id, timezone: users.timezone }).from(users);

  for (const user of rows) {
    const local = localWeekdayAndHour(now, user.timezone);
    if (env.OPENROUTER_API_KEY && local.weekday === WEEKLY_REVIEW.weekday && local.hour === WEEKLY_REVIEW.hour) {
      try {
        await requestReview(db, env, user, "weekly", "scheduled");
      } catch (error) {
        console.error("schedule weekly review failed", error instanceof Error ? error.name : "unknown");
      }
    }
  }
}
