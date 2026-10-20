import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createDb, getEnv } from "@/db";
import { recordAudit } from "@/lib/audit";
import { createGoogleClient, isEmailAllowed, parseIdToken } from "@/lib/auth/google";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { upsertGoogleUser } from "@/lib/auth/users";

function loginError(request: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, request.url));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("google_oauth_state")?.value;
  const codeVerifier = cookieStore.get("google_code_verifier")?.value;
  cookieStore.delete("google_oauth_state");
  cookieStore.delete("google_code_verifier");

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return loginError(request, "invalid_state");
  }

  const env = await getEnv();
  const google = createGoogleClient(env, request.nextUrl.origin);

  let claims;
  try {
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    claims = parseIdToken(tokens.idToken());
  } catch {
    return loginError(request, "oauth_failed");
  }

  if (claims.email_verified === false || !isEmailAllowed(env, claims.email)) {
    return loginError(request, "not_allowed");
  }

  const db = createDb(env.DB);
  const { userId, created } = await upsertGoogleUser(db, env, claims);
  const session = await createSession(db, userId);
  await setSessionCookie(session.token, session.expiresAt);
  await recordAudit(db, { userId, action: created ? "auth.signup" : "auth.login" });

  return NextResponse.redirect(new URL("/", request.url));
}
