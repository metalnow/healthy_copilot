// 以 session token 查詢使用者。不依賴 next/*，Worker 入口（例如串流匯出）也能使用。
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";

export const SESSION_COOKIE = "hc_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  timezone: string;
};

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

/** 從 Cookie 標頭取出 session token */
export function sessionTokenFromCookie(header: string | null) {
  for (const part of (header ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}
