import "server-only";
import { NextResponse, type NextRequest } from "next/server";

/** 以 cookie 驗證的 POST API 額外檢查 Origin，防止跨站請求 */
export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === null || origin === request.nextUrl.origin;
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
