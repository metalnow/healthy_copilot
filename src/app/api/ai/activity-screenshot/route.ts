import type { NextRequest } from "next/server";
import { analyzeActivityScreenshot } from "@/server/ai/tasks";
import { jsonError } from "@/server/http";
import { handleAiRequest } from "../handle";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  return handleAiRequest(request, async ({ db, env, user }) => {
    const file = (await request.formData()).get("screenshot");
    if (!(file instanceof File)) return jsonError("請選擇截圖", 400);
    if (!ALLOWED_TYPES.has(file.type)) return jsonError("只支援 JPEG、PNG、WebP 圖片", 415);
    if (file.size > MAX_BYTES) return jsonError("圖片太大（上限 5 MB）", 413);
    return analyzeActivityScreenshot(db, env, user, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      filename: file.name,
    });
  });
}
