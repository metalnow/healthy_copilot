import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createDb, getEnv } from "@/db";
import { recordAudit } from "@/lib/audit";
import { ArcticFetchError, OAuth2RequestError, UnexpectedErrorResponseBodyError, UnexpectedResponseError } from "arctic";
import { createGoogleClient, isEmailAllowed, parseIdToken } from "@/lib/auth/google";
import { getCurrentUser } from "@/lib/auth/dal";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DRIVE_SCOPE, saveDriveTokens } from "@/server/google-drive";
import { upsertGoogleUser } from "@/lib/auth/users";

function loginError(request: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, request.url));
}

function driveResult(request: NextRequest, result: string, code?: string) {
  const url = new URL(`/settings/data?drive=${result}`, request.url);
  if (code) url.searchParams.set("code", code.slice(0, 60));
  return NextResponse.redirect(url);
}

/** OAuth 失敗的原因代碼（例如 invalid_grant、redirect_uri_mismatch），不含任何憑證 */
function oauthErrorCode(error: unknown) {
  if (error instanceof OAuth2RequestError) return error.code;
  if (error instanceof UnexpectedResponseError || error instanceof UnexpectedErrorResponseBodyError) return `http_${error.status}`;
  if (error instanceof ArcticFetchError) return "network";
  return error instanceof Error ? error.name : "unknown";
}

/** Drive 授權回呼：必須是目前登入的同一個 Google 帳號，且確實授權了 drive.file */
async function connectDrive(
  request: NextRequest,
  env: CloudflareEnv,
  google: ReturnType<typeof createGoogleClient>,
  code: string,
  codeVerifier: string,
) {
  const current = await getCurrentUser();
  if (!current) return NextResponse.redirect(new URL("/login", request.url));

  let tokens;
  let claims;
  try {
    tokens = await google.validateAuthorizationCode(code, codeVerifier);
    claims = parseIdToken(tokens.idToken());
  } catch (error) {
    const code = oauthErrorCode(error);
    console.warn("Drive OAuth failed", { code });
    return driveResult(request, "failed", code);
  }

  const db = createDb(env.DB);
  const [user] = await db.select({ sub: users.googleSubjectId }).from(users).where(eq(users.id, current.id)).limit(1);
  if (!user || user.sub !== claims.sub) return driveResult(request, "wrong_account");
  if (!tokens.hasScopes() || !tokens.scopes().includes(DRIVE_SCOPE)) return driveResult(request, "scope_denied");
  if (!tokens.hasRefreshToken()) return driveResult(request, "failed", "no_refresh_token");

  await saveDriveTokens(db, env, current.id, {
    accessToken: tokens.accessToken(),
    refreshToken: tokens.refreshToken(),
    expiresAt: tokens.accessTokenExpiresAt(),
    scope: DRIVE_SCOPE,
  });
  await recordAudit(db, { userId: current.id, action: "google_drive.connect" });
  return driveResult(request, "connected");
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  // Google 回傳錯誤（使用者取消，或應用程式未發布、帳號不是測試使用者）
  const googleError = request.nextUrl.searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("google_oauth_state")?.value;
  const codeVerifier = cookieStore.get("google_code_verifier")?.value;
  const purpose = cookieStore.get("google_oauth_purpose")?.value;
  cookieStore.delete("google_oauth_state");
  cookieStore.delete("google_code_verifier");
  cookieStore.delete("google_oauth_purpose");

  if (googleError && purpose === "drive") return driveResult(request, "denied", googleError);
  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return purpose === "drive" ? driveResult(request, "invalid_state") : loginError(request, "invalid_state");
  }

  const env = await getEnv();
  const google = createGoogleClient(env, request.nextUrl.origin);

  if (purpose === "drive") return connectDrive(request, env, google, code, codeVerifier);

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
