import { createDb } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { oauthTokens, users, userSettings } from "@/db/schema";
import { requestReview } from "@/server/ai/reviews";
import { localWeekdayAndHour, toLocalDate } from "@/lib/time";
import type { JobMessage } from "./types";

/** 週回顧在使用者當地週日 21:00 產生 */
const WEEKLY_REVIEW = { weekday: 0, hour: 21 } as const;
/** 自動備份在當地 03:00：每天 / 每週一 / 每月 1 日 */
const BACKUP_HOUR = 3;

export function isBackupDue(frequency: string, local: { weekday: number; hour: number }, dayOfMonth: number) {
  if (local.hour !== BACKUP_HOUR) return false;
  if (frequency === "daily") return true;
  if (frequency === "weekly") return local.weekday === 1;
  if (frequency === "monthly") return dayOfMonth === 1;
  return false;
}

/**
 * 每小時由 Cron Trigger 呼叫：依各使用者時區判斷是否到了回顧 / 備份時間，
 * 到期的工作送進 Queue 處理，cron 本身不做耗時工作。
 */
export async function handleScheduled(controller: ScheduledController, env: CloudflareEnv) {
  const now = new Date(controller.scheduledTime);
  const db = createDb(env.DB);
  const rows = await db
    .select({ id: users.id, timezone: users.timezone, frequency: userSettings.backupFrequency, driveToken: oauthTokens.id })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .leftJoin(oauthTokens, and(eq(oauthTokens.userId, users.id), eq(oauthTokens.purpose, "drive")));

  for (const user of rows) {
    const local = localWeekdayAndHour(now, user.timezone);
    if (env.OPENROUTER_API_KEY && local.weekday === WEEKLY_REVIEW.weekday && local.hour === WEEKLY_REVIEW.hour) {
      try {
        await requestReview(db, env, user, "weekly", "scheduled");
      } catch (error) {
        console.error("schedule weekly review failed", error instanceof Error ? error.name : "unknown");
      }
    }
    const dayOfMonth = Number(toLocalDate(now, user.timezone).slice(8, 10));
    if (user.driveToken && isBackupDue(user.frequency ?? "weekly", local, dayOfMonth)) {
      await env.AI_QUEUE.send({ kind: "drive_backup", userId: user.id } satisfies JobMessage);
    }
  }
}
