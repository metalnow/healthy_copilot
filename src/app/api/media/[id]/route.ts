import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb, getEnv } from "@/db";
import { mediaObjects } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/dal";
import { jsonError } from "@/server/http";

/** 原始檔只提供給擁有者，且不快取 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/media/[id]">) {
  const user = await getCurrentUser();
  if (!user) return jsonError("請先登入", 401);
  const { id } = await params;

  const [media] = await (await getDb())
    .select()
    .from(mediaObjects)
    .where(and(eq(mediaObjects.id, id), eq(mediaObjects.userId, user.id)))
    .limit(1);
  if (!media) return jsonError("找不到檔案", 404);

  const object = await (await getEnv()).MEDIA.get(media.r2Key);
  if (!object) return jsonError("找不到檔案", 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(media.sizeBytes),
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
