import type { NextRequest } from "next/server";
import { getEnv } from "@/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { exportResponse } from "@/server/export";
import { jsonError } from "@/server/http";

/** 匯出全部資料。正式環境由 worker.ts 直接處理（串流不經框架）；這裡供 next dev 使用 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("請先登入", 401);
  return exportResponse(await getEnv(), user, request.nextUrl.searchParams.get("media") === "1");
}
