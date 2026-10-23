import type { HEALTH_DOCUMENT_STATUSES } from "@/lib/enums";

export const DOCUMENT_STATUS_LABELS: Record<(typeof HEALTH_DOCUMENT_STATUSES)[number], string> = {
  uploaded: "已上傳",
  extracting: "AI 辨識中",
  review: "待確認",
  confirmed: "已確認",
  failed: "辨識失敗",
};

export const DOCUMENT_ERROR_MESSAGES: Record<string, string> = {
  not_configured: "尚未設定 OpenRouter API Key",
  no_endpoint: "目前的影像模型沒有符合隱私設定的服務端點，請到設定更換模型",
  invalid_output: "AI 無法解析這份報告，可以重試或改用較清晰的檔案",
  insufficient_credits: "OpenRouter 額度不足",
  auth: "OpenRouter API Key 無效",
  timeout: "AI 處理逾時，請按「重新辨識」再試一次",
  provider_error: "AI 服務暫時無法使用，請稍後按「重新辨識」",
  rate_limited: "AI 請求過於頻繁，請稍後再試",
  bad_request: "AI 無法處理這份檔案的格式",
  unexpected: "發生未預期的錯誤",
};
