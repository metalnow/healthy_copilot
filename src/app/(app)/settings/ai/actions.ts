"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, getEnv } from "@/db";
import { userSettings } from "@/db/schema";
import { validateModelChoice } from "@/lib/ai/model-profiles";
import { listModels, listZdrEndpointParams } from "@/lib/ai/openrouter";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { MODEL_PROFILE_KEYS, type ModelProfileKey } from "@/lib/enums";
import { formString, type ActionState } from "@/lib/form";
import { resetModelProfile, saveModelProfile } from "@/server/ai/model-profiles";

export async function updateModelProfile(
  key: ModelProfileKey,
  _prev: ActionState & { saved?: boolean },
  formData: FormData,
): Promise<ActionState & { saved?: boolean }> {
  const user = await requireUser();
  if (!MODEL_PROFILE_KEYS.includes(key)) return { error: "不支援的模型用途" };
  const modelId = formString(formData, "modelId");
  if (!modelId || modelId.length > 200) return { error: "請輸入模型 ID" };

  const env = await getEnv();
  const config = { baseUrl: env.OPENROUTER_BASE_URL || undefined };
  let problem: string | null;
  try {
    const [models, zdr] = await Promise.all([listModels(config), listZdrEndpointParams(config)]);
    problem = validateModelChoice(key, modelId, models, zdr);
  } catch {
    return { error: "無法取得 OpenRouter 模型清單，請稍後再試" };
  }
  if (problem) return { error: problem };

  const db = await getDb();
  await saveModelProfile(db, key, modelId);
  await recordAudit(db, { userId: user.id, action: "model_profile.update", entityId: key, metadata: { modelId } });
  revalidatePath("/settings/ai");
  return { saved: true };
}

export async function resetModelProfileAction(formData: FormData) {
  const user = await requireUser();
  const key = formString(formData, "key") as ModelProfileKey | undefined;
  if (!key || !MODEL_PROFILE_KEYS.includes(key)) return;
  const db = await getDb();
  await resetModelProfile(db, key);
  await recordAudit(db, { userId: user.id, action: "model_profile.reset", entityId: key });
  revalidatePath("/settings/ai");
}

export async function updateAiLogging(formData: FormData) {
  const user = await requireUser();
  const enabled = formString(formData, "enabled") === "true";
  const db = await getDb();
  await db.update(userSettings).set({ aiLogRawContent: enabled }).where(eq(userSettings.userId, user.id));
  await recordAudit(db, { userId: user.id, action: "settings.ai_log_raw_content", metadata: { enabled } });
  revalidatePath("/settings/ai");
}
