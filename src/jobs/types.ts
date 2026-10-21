/** AI_QUEUE 的訊息格式 */
export type JobMessage =
  | { kind: "report_extraction"; userId: string; documentId: string }
  | { kind: "weekly_review"; userId: string }
  | { kind: "drive_backup"; userId: string };
