import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { userKeys } from "@/db/schema";
import { importMasterKey, unwrapDataKey } from "@/lib/crypto";

/** 取得使用者的資料加密金鑰（DEK） */
export async function getUserDataKey(
  db: Db,
  env: Pick<CloudflareEnv, "MASTER_ENCRYPTION_KEY">,
  userId: string,
  options: { extractable?: boolean } = {},
) {
  const [row] = await db.select().from(userKeys).where(eq(userKeys.userId, userId)).limit(1);
  if (!row) throw new Error("User data key missing");
  return unwrapDataKey(await importMasterKey(env.MASTER_ENCRYPTION_KEY), row.wrappedKey, userId, options.extractable);
}
