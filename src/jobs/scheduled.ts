import { createDb } from "@/db/client";
import { users } from "@/db/schema";
import { localWeekdayAndHour } from "@/lib/time";
import type { JobMessage } from "./types";

/** 週回顧在使用者當地週日 21:00 產生（Sprint 6 實作） */
const WEEKLY_REVIEW = { weekday: 0, hour: 21 } as const;

/**
 * 每小時由 Cron Trigger 呼叫：依各使用者時區判斷是否到了回顧 / 備份時間，
 * 到期的工作送進 Queue 處理，cron 本身不做耗時工作。
 */
export async function handleScheduled(controller: ScheduledController, env: CloudflareEnv) {
  const now = new Date(controller.scheduledTime);
  const db = createDb(env.DB);
  const rows = await db.select({ id: users.id, timezone: users.timezone }).from(users);

  const due = rows.filter((user) => {
    const local = localWeekdayAndHour(now, user.timezone);
    return local.weekday === WEEKLY_REVIEW.weekday && local.hour === WEEKLY_REVIEW.hour;
  });

  if (due.length > 0) {
    await env.AI_QUEUE.sendBatch(
      due.map((user) => ({ body: { kind: "weekly_review", userId: user.id } satisfies JobMessage })),
    );
  }
}
