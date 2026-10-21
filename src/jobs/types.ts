/** AI_QUEUE 的訊息格式 */
export type JobMessage =
  | { kind: "report_extraction"; userId: string; documentId: string }
  | { kind: "review"; userId: string; reviewId: string }
  | { kind: "drive_backup"; userId: string };
