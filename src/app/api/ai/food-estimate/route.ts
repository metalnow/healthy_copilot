import type { NextRequest } from "next/server";
import { z } from "zod";
import { estimateFoodNutrition } from "@/server/ai/tasks";
import { jsonError } from "@/server/http";
import { handleAiRequest } from "../handle";

const BodySchema = z.object({
  items: z
    .array(z.object({ name: z.string().trim().min(1).max(100), portion: z.string().trim().max(50).optional() }))
    .min(1)
    .max(30),
});

export async function POST(request: NextRequest) {
  return handleAiRequest(request, async ({ db, env, user }) => {
    const body = BodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return jsonError("請先輸入品項", 400);
    return estimateFoodNutrition(db, env, user, body.data.items);
  });
}
