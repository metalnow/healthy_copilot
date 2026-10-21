"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { ConfirmDraftSchema } from "@/lib/ai/draft";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { confirmDraft } from "@/server/ai/confirm";
import { settleExtraction } from "@/server/ai/extractions";

export async function confirmAiDraft(input: unknown): Promise<{ error: string }> {
  const user = await requireUser();
  const draft = ConfirmDraftSchema.safeParse(input);
  if (!draft.success) {
    return { error: draft.error.issues[0]?.message ?? "內容不正確，請檢查後再試" };
  }

  const error = await confirmDraft(await getDb(), user, draft.data);
  if (error) return { error };
  redirect("/");
}

export async function discardAiDraft(extractionId: string) {
  const user = await requireUser();
  if (typeof extractionId !== "string" || extractionId === "") return;
  const db = await getDb();
  if (await settleExtraction(db, user.id, extractionId, "discarded")) {
    await recordAudit(db, { userId: user.id, action: "ai_extraction.discard", entityId: extractionId });
  }
}
