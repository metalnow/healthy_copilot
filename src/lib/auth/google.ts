import "server-only";
import { decodeIdToken, Google } from "arctic";

/** 登入只要求最小 identity scope；Drive scope 於啟用備份時另外授權 */
export const LOGIN_SCOPES = ["openid", "email", "profile"];

export function createGoogleClient(env: CloudflareEnv, origin: string) {
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${origin}/api/auth/google/callback`,
  );
}

export type GoogleIdTokenClaims = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

/**
 * ID token 是在伺服器端透過 TLS 直接向 Google token endpoint 取得，
 * 依 OIDC Core 3.1.3.7 可不另驗簽章，僅解析 claims。
 */
export function parseIdToken(idToken: string): GoogleIdTokenClaims {
  const claims = decodeIdToken(idToken) as Partial<GoogleIdTokenClaims>;
  if (!claims.sub || !claims.email) {
    throw new Error("ID token missing sub or email");
  }
  return claims as GoogleIdTokenClaims;
}

export function isEmailAllowed(env: CloudflareEnv, email: string): boolean {
  const allowed = env.ALLOWED_EMAILS?.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(email.toLowerCase());
}
