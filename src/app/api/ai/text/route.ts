import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseHealthText } from "@/server/ai/tasks";
import { jsonError } from "@/server/http";
import { handleAiRequest } from "../handle";

const BodySchema = z.object({ text: z.string().trim().min(1).max(1000) });

export async function POST(request: NextRequest) {
  return handleAiRequest(request, async ({ db, env, user }) => {
    const body = BodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return jsonError("請輸入 1–1000 字的內容", 400);
    return parseHealthText(db, env, user, body.data.text);
  });
}
