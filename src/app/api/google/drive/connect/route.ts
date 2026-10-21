import { generateCodeVerifier, generateState } from "arctic";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { createGoogleClient } from "@/lib/auth/google";
import { DRIVE_SCOPE } from "@/server/google-drive";

const COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 10,
} as const;

/** 第一次啟用備份時才另外要求 Drive 權限（drive.file：只能存取本 App 建立的檔案） */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const google = createGoogleClient(await getEnv(), request.nextUrl.origin);
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, ["openid", DRIVE_SCOPE]);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("login_hint", user.email);

  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, COOKIE);
  cookieStore.set("google_code_verifier", codeVerifier, COOKIE);
  cookieStore.set("google_oauth_purpose", "drive", COOKIE);
  return NextResponse.redirect(url);
}
