import { createDb } from "@/db/client";
import { runReportExtraction } from "@/server/ai/reports";
import { runReview } from "@/server/ai/reviews";
import { runBackup } from "@/server/backup";
import type { JobMessage } from "./types";

/** AI_QUEUE consumer */
export async function handleQueue(batch: MessageBatch<JobMessage>, env: CloudflareEnv) {
  const db = createDb(env.DB);
  for (const message of batch.messages) {
    try {
      const body = message.body;
      let result: "done" | "retry" = "done";
      if (body.kind === "report_extraction") {
        result = await runReportExtraction(db, env, body, message.attempts);
      } else if (body.kind === "review") {
        result = await runReview(db, env, body, message.attempts);
      } else if (body.kind === "drive_backup") {
        await runBackup(db, env, body.userId, "scheduled");
      }
      if (result === "retry") message.retry({ delaySeconds: 30 * message.attempts });
      else message.ack();
    } catch (error) {
      console.error("queue job failed", { kind: message.body.kind, error: error instanceof Error ? error.name : "unknown" });
      message.retry({ delaySeconds: 60 });
    }
  }
}
