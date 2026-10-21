import type { NextRequest } from "next/server";
import { audioFormatFor, transcribeAndParse } from "@/server/ai/tasks";
import { jsonError } from "@/server/http";
import { handleAiRequest } from "../handle";

/** 約 2 分鐘的 opus 錄音；前端限制 60 秒 */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  return handleAiRequest(request, async ({ db, env, user }) => {
    const file = (await request.formData()).get("audio");
    if (!(file instanceof File)) return jsonError("沒有收到錄音", 400);
    if (file.size === 0) return jsonError("錄音是空的，請再試一次", 400);
    if (file.size > MAX_BYTES) return jsonError("錄音太長（上限約 60 秒）", 413);
    const format = audioFormatFor(file.type);
    if (!format) return jsonError("不支援的錄音格式", 415);

    return transcribeAndParse(db, env, user, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      format,
    });
  });
}
