"use server";

import { redirect } from "next/navigation";
import { getDb, getEnv } from "@/db";
import { AiError } from "@/lib/ai/openrouter";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { formString } from "@/lib/form";
import { requestReview } from "@/server/ai/reviews";

export async function generateReview(formData: FormData) {
  const user = await requireUser();
  const period = formString(formData, "period") === "monthly" ? "monthly" : "weekly";
  const db = await getDb();
  let id: string;
  try {
    id = await requestReview(db, await getEnv(), user, period, "manual");
  } catch (error) {
    if (error instanceof AiError) redirect(`/insights?error=${error.code}`);
    throw error;
  }
  await recordAudit(db, { userId: user.id, action: "ai_review.request", entityId: id, metadata: { period } });
  redirect(`/insights/reviews/${id}`);
}
