import type { ModelProfileKey } from "@/lib/enums";
import type { ModelInfo } from "./openrouter";

export type ModelProfile = {
  key: ModelProfileKey;
  modelId: string;
  maxTokens: number | null;
};

/**
 * 預設模型：皆有支援結構化輸出的 OpenRouter Zero Data Retention 端點；可於「設定 → AI 模型」覆寫。
 * 不送 temperature：多數 ZDR 端點不支援，加上 require_parameters 會導致找不到端點。
 */
export const DEFAULT_MODEL_PROFILES: Record<ModelProfileKey, ModelProfile> = {
  fast: { key: "fast", modelId: "anthropic/claude-haiku-5.5", maxTokens: 4000 },
  vision: { key: "vision", modelId: "google/gemini-3.8-flash", maxTokens: 4000 },
  asr: { key: "asr", modelId: "openai/whisper-large-v3", maxTokens: null },
  reasoning: { key: "reasoning", modelId: "anthropic/claude-sonnet-5.5", maxTokens: 8000 },
  medical_summary: { key: "medical_summary", modelId: "anthropic/claude-opus-5.5", maxTokens: 8000 },
};

type Capability = "text" | "image" | "transcription";

export const MODEL_PROFILE_META: Record<
  ModelProfileKey,
  { label: string; usedFor: string; capability: Capability }
> = {
  vision: { label: "影像辨識", usedFor: "食物照片、健檢報告、睡眠截圖", capability: "image" },
  asr: { label: "語音轉文字", usedFor: "語音輸入", capability: "transcription" },
  fast: { label: "快速解析", usedFor: "文字 / 語音內容轉成紀錄", capability: "text" },
  reasoning: { label: "推理", usedFor: "每週 / 每月回顧（Sprint 6 起）", capability: "text" },
  medical_summary: { label: "醫療摘要", usedFor: "季度回顧、Doctor Summary（P1）", capability: "text" },
};

/** 檢查模型是否適用於該用途；回傳錯誤訊息或 null */
export function validateModelChoice(
  key: ModelProfileKey,
  modelId: string,
  models: Map<string, ModelInfo>,
  zdrEndpointParams: Map<string, Set<string>>,
): string | null {
  const model = models.get(modelId);
  if (!model) return "OpenRouter 上找不到這個模型 ID";

  const capability = MODEL_PROFILE_META[key].capability;
  if (capability === "transcription" && !model.outputModalities.includes("transcription")) {
    return "這個模型不是語音轉文字模型";
  }
  if (capability === "image" && !model.inputModalities.includes("image")) {
    return "這個模型不支援圖片輸入";
  }
  if (capability === "image" && !model.inputModalities.includes("file")) {
    return "這個模型不支援 PDF 檔案輸入（健檢報告需要）";
  }
  if (capability !== "transcription" && !model.outputModalities.includes("text")) {
    return "這個模型不會輸出文字";
  }
  const zdrParams = zdrEndpointParams.get(modelId);
  if (!zdrParams) {
    return "這個模型沒有零資料保留（ZDR）端點，基於隱私無法使用";
  }
  // 結構化輸出（JSON Schema）以 require_parameters 要求，ZDR 端點必須支援
  if (capability !== "transcription" && !zdrParams.has("response_format")) {
    return "這個模型的零資料保留（ZDR）端點不支援結構化輸出，無法用於這個用途";
  }
  return null;
}
