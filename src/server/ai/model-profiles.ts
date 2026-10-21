import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { modelProfiles } from "@/db/schema";
import { DEFAULT_MODEL_PROFILES, type ModelProfile } from "@/lib/ai/model-profiles";
import { MODEL_PROFILE_KEYS, type ModelProfileKey } from "@/lib/enums";

export async function listModelProfiles(db: Db): Promise<Record<ModelProfileKey, ModelProfile & { isDefault: boolean }>> {
  const rows = await db.select().from(modelProfiles);
  const overrides = new Map(rows.map((r) => [r.key, r]));
  return Object.fromEntries(
    MODEL_PROFILE_KEYS.map((key) => {
      const row = overrides.get(key);
      const profile: ModelProfile = row
        ? { key, modelId: row.modelId, temperature: row.temperature, maxTokens: row.maxTokens }
        : DEFAULT_MODEL_PROFILES[key];
      return [key, { ...profile, isDefault: !row }];
    }),
  ) as Record<ModelProfileKey, ModelProfile & { isDefault: boolean }>;
}

export async function getModelProfile(db: Db, key: ModelProfileKey): Promise<ModelProfile> {
  const [row] = await db.select().from(modelProfiles).where(eq(modelProfiles.key, key)).limit(1);
  if (!row) return DEFAULT_MODEL_PROFILES[key];
  return { key, modelId: row.modelId, temperature: row.temperature, maxTokens: row.maxTokens };
}

export async function saveModelProfile(db: Db, key: ModelProfileKey, modelId: string) {
  const defaults = DEFAULT_MODEL_PROFILES[key];
  const values = { modelId, temperature: defaults.temperature, maxTokens: defaults.maxTokens };
  await db
    .insert(modelProfiles)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: modelProfiles.key, set: values });
}

export async function resetModelProfile(db: Db, key: ModelProfileKey) {
  await db.delete(modelProfiles).where(eq(modelProfiles.key, key));
}
