import { createDb } from "@/db/client";
import { runReportExtraction } from "@/server/ai/reports";
import { runReview } from "@/server/ai/reviews";
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
      }
      // drive_backup 於 Sprint 7 實作
      if (result === "retry") message.retry({ delaySeconds: 30 * message.attempts });
      else message.ack();
    } catch (error) {
      console.error("queue job failed", { kind: message.body.kind, error: error instanceof Error ? error.name : "unknown" });
      message.retry({ delaySeconds: 60 });
    }
  }
}
