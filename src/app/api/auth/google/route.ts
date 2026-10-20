import { generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/db";
import { createGoogleClient, LOGIN_SCOPES } from "@/lib/auth/google";

const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 10,
} as const;

export async function GET(request: NextRequest) {
  const google = createGoogleClient(await getEnv(), request.nextUrl.origin);
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, LOGIN_SCOPES);
  url.searchParams.set("prompt", "select_account");

  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, OAUTH_COOKIE_OPTIONS);
  cookieStore.set("google_code_verifier", codeVerifier, OAUTH_COOKIE_OPTIONS);

  return NextResponse.redirect(url);
}
