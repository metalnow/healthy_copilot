import type { NextRequest } from "next/server";
import { analyzeFoodPhoto } from "@/server/ai/tasks";
import { jsonError } from "@/server/http";
import { handleAiRequest } from "../handle";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  return handleAiRequest(request, async ({ db, env, user }) => {
    const form = await request.formData();
    const file = form.get("photo");
    const note = form.get("note");
    if (!(file instanceof File)) return jsonError("請選擇照片", 400);
    if (!ALLOWED_TYPES.has(file.type)) return jsonError("只支援 JPEG、PNG、WebP 圖片", 415);
    if (file.size > MAX_BYTES) return jsonError("照片太大（上限 5 MB）", 413);

    return analyzeFoodPhoto(db, env, user, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: file.type,
      filename: file.name,
    }, typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : undefined);
  });
}
