import type { JobMessage } from "./scheduled";

/** AI_QUEUE consumer；各類工作於後續 Sprint 實作 */
export async function handleQueue(batch: MessageBatch<JobMessage>) {
  for (const message of batch.messages) {
    switch (message.body.kind) {
      case "weekly_review":
      case "ai_extraction":
        // TODO(Sprint 3 / 6): 實作 AI 擷取與週回顧
        message.ack();
        break;
      default:
        message.ack();
    }
  }
}
