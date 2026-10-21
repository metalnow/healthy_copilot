import { Google } from "arctic";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { oauthTokens } from "@/db/schema";
import { decryptString, encryptString } from "@/lib/crypto";
import { DriveClient } from "@/lib/google-drive";
import { getUserDataKey } from "./keys";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

type Env = Pick<CloudflareEnv, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "MASTER_ENCRYPTION_KEY">;

const aad = (userId: string, kind: "access" | "refresh") => `oauth:google:drive:${kind}:${userId}`;

/** Drive token 以使用者 DEK 加密後存放 */
export async function saveDriveTokens(
  db: Db,
  env: Env,
  userId: string,
  tokens: { accessToken: string; refreshToken: string | null; expiresAt: Date; scope: string },
) {
  const key = await getUserDataKey(db, env, userId);
  const values = {
    scope: tokens.scope,
    encryptedAccessToken: await encryptString(key, tokens.accessToken, aad(userId, "access")),
    accessTokenExpiresAt: tokens.expiresAt,
    ...(tokens.refreshToken && {
      encryptedRefreshToken: await encryptString(key, tokens.refreshToken, aad(userId, "refresh")),
    }),
  };
  await db
    .insert(oauthTokens)
    .values({ userId, provider: "google", purpose: "drive", ...values })
    .onConflictDoUpdate({
      target: [oauthTokens.userId, oauthTokens.provider, oauthTokens.purpose],
      set: { ...values, updatedAt: new Date() },
    });
}

async function getTokenRow(db: Db, userId: string) {
  const [row] = await db
    .select()
    .from(oauthTokens)
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.provider, "google"), eq(oauthTokens.purpose, "drive")))
    .limit(1);
  return row ?? null;
}

export async function isDriveConnected(db: Db, userId: string) {
  const row = await getTokenRow(db, userId);
  return Boolean(row?.encryptedRefreshToken);
}

export class DriveNotConnectedError extends Error {
  constructor() {
    super("尚未連結 Google Drive，或授權已失效，請重新連結");
    this.name = "DriveNotConnectedError";
  }
}

function googleClient(env: Env) {
  // refresh / revoke 不會用到 redirect URI
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, "https://localhost/unused");
}

/** 取得可用的 Drive client；access token 快過期時自動換新 */
export async function getDriveClient(db: Db, env: Env, userId: string, doFetch?: typeof fetch) {
  const row = await getTokenRow(db, userId);
  if (!row?.encryptedRefreshToken) throw new DriveNotConnectedError();
  const key = await getUserDataKey(db, env, userId);

  let accessToken = await decryptString(key, row.encryptedAccessToken, aad(userId, "access"));
  const expiresAt = row.accessTokenExpiresAt?.getTime() ?? 0;
  if (expiresAt - Date.now() < 60_000) {
    const refreshToken = await decryptString(key, row.encryptedRefreshToken, aad(userId, "refresh"));
    try {
      const tokens = await googleClient(env).refreshAccessToken(refreshToken);
      accessToken = tokens.accessToken();
      await saveDriveTokens(db, env, userId, {
        accessToken,
        refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : null,
        expiresAt: tokens.accessTokenExpiresAt(),
        scope: row.scope,
      });
    } catch {
      throw new DriveNotConnectedError();
    }
  }
  return new DriveClient(accessToken, doFetch);
}

/** 撤銷授權並刪除 token */
export async function disconnectDrive(db: Db, env: Env, userId: string) {
  const row = await getTokenRow(db, userId);
  if (!row) return;
  try {
    if (row.encryptedRefreshToken) {
      const key = await getUserDataKey(db, env, userId);
      await googleClient(env).revokeToken(await decryptString(key, row.encryptedRefreshToken, aad(userId, "refresh")));
    }
  } catch {
    // 撤銷失敗（例如已在 Google 帳號端移除）不影響本地刪除
  }
  await db.delete(oauthTokens).where(eq(oauthTokens.id, row.id));
}
