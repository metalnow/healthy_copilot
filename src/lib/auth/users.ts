import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { users, userKeys, userSettings } from "@/db/schema";
import { createWrappedDataKey, importMasterKey } from "@/lib/crypto";
import type { GoogleIdTokenClaims } from "./google";

/** 依 Google subject 建立或更新使用者；新使用者同時建立 DEK 與預設設定 */
export async function upsertGoogleUser(
  db: Db,
  env: CloudflareEnv,
  claims: GoogleIdTokenClaims,
): Promise<{ userId: string; created: boolean }> {
  const profile = {
    email: claims.email,
    name: claims.name ?? null,
    avatarUrl: claims.picture ?? null,
  };

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.googleSubjectId, claims.sub))
    .limit(1);

  if (existing) {
    await db.update(users).set(profile).where(eq(users.id, existing.id));
    return { userId: existing.id, created: false };
  }

  const userId = crypto.randomUUID();
  const wrappedKey = await createWrappedDataKey(
    await importMasterKey(env.MASTER_ENCRYPTION_KEY),
    userId,
  );

  // D1 batch 為單一交易
  await db.batch([
    db.insert(users).values({ id: userId, googleSubjectId: claims.sub, ...profile }),
    db.insert(userKeys).values({ userId, wrappedKey }),
    db.insert(userSettings).values({ userId }),
  ]);
  return { userId, created: true };
}
