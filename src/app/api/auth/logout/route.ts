import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { recordAudit } from "@/lib/audit";
import { getCurrentSession } from "@/lib/auth/dal";
import { deleteSessionCookie, invalidateSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const current = await getCurrentSession();
  if (current) {
    const db = await getDb();
    await invalidateSession(db, current.sessionId);
    await recordAudit(db, { userId: current.user.id, action: "auth.logout" });
  }
  await deleteSessionCookie();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
