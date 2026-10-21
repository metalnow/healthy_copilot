import type { Db } from "@/db/client";
import { auditLogs } from "@/db/schema";

type AuditEntry = {
  userId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  /** 只放操作中繼資料，不可包含健康內容 */
  metadata?: Record<string, unknown>;
};

export async function recordAudit(db: Db, entry: AuditEntry) {
  await db.insert(auditLogs).values(entry);
}
