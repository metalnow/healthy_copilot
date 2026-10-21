import { createDb } from "@/db/client";
import { runReportExtraction } from "@/server/ai/reports";
import type { JobMessage } from "./types";

/** AI_QUEUE consumer */
export async function handleQueue(batch: MessageBatch<JobMessage>, env: CloudflareEnv) {
  const db = createDb(env.DB);
  for (const message of batch.messages) {
    try {
      const body = message.body;
      if (body.kind === "report_extraction") {
        const result = await runReportExtraction(db, env, body, message.attempts);
        if (result === "retry") {
          message.retry({ delaySeconds: 30 * message.attempts });
          continue;
        }
      }
      // weekly_review、drive_backup 於 Sprint 6 / 7 實作
      message.ack();
    } catch (error) {
      console.error("queue job failed", { kind: message.body.kind, error: error instanceof Error ? error.name : "unknown" });
      message.retry({ delaySeconds: 60 });
    }
  }
}
