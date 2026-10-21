import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getDb, getEnv } from "@/db";
import { AiError } from "@/lib/ai/openrouter";
import { getCurrentUser } from "@/lib/auth/dal";
import type { SessionUser } from "@/lib/auth/session";
import type { Db } from "@/db/client";
import { isSameOrigin, jsonError } from "@/server/http";
import type { AiTaskResult } from "@/server/ai/tasks";

const STATUS_BY_CODE: Partial<Record<AiError["code"], number>> = {
  not_configured: 503,
  rate_limited: 429,
  timeout: 504,
  invalid_output: 502,
};

/** AI API 共用：驗證登入與來源、統一錯誤格式 */
export async function handleAiRequest(
  request: NextRequest,
  run: (ctx: { db: Db; env: CloudflareEnv; user: SessionUser }) => Promise<AiTaskResult | Response>,
) {
  if (!isSameOrigin(request)) return jsonError("不允許的來源", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("請先登入", 401);

  try {
    const result = await run({ db: await getDb(), env: await getEnv(), user });
    return result instanceof Response ? result : NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiError) {
      console.warn("AI request failed", { code: error.code });
      return jsonError(error.userMessage, STATUS_BY_CODE[error.code] ?? 502);
    }
    console.error("AI request crashed", error instanceof Error ? error.name : "unknown");
    return jsonError("發生未預期的錯誤，請稍後再試", 500);
  }
}
