// Secrets 不在 wrangler.jsonc 內，`wrangler types` 不會產生，這裡手動補上。
interface CloudflareEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** 32 bytes base64，用於包裝每位使用者的資料金鑰（envelope encryption） */
  MASTER_ENCRYPTION_KEY: string;
  OPENROUTER_API_KEY?: string;
  /** 僅供本機測試指向假的 OpenRouter；正式環境不要設定 */
  OPENROUTER_BASE_URL?: string;
}
