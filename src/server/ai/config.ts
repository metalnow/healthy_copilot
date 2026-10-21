import type { OpenRouterConfig } from "@/lib/ai/openrouter";

export function openRouterConfig(env: Pick<CloudflareEnv, "OPENROUTER_API_KEY" | "OPENROUTER_BASE_URL">): OpenRouterConfig {
  return { apiKey: env.OPENROUTER_API_KEY ?? "", baseUrl: env.OPENROUTER_BASE_URL || undefined };
}
