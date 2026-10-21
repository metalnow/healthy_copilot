import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { Db } from "@/db";
import { sessions, users } from "@/db/schema";
import { randomBytes, sha256Hex, toBase64Url } from "@/lib/crypto";

export const SESSION_COOKIE = "hc_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;
};

/** 建立 session；回傳的 token 只放在 cookie，資料庫只存其 SHA-256 */
export async function createSession(db: Db, userId: string) {
  const token = toBase64Url(randomBytes(32));
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: await sha256Hex(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSessionToken(
  db: Db,
  token: string,
): Promise<{ sessionId: string; user: SessionUser } | null> {
  const sessionId = await sha256Hex(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  return { sessionId, user: row.user };
}

export async function invalidateSession(db: Db, sessionId: string) {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}
