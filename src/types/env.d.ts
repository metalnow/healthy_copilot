// Secrets 不在 wrangler.jsonc 內，`wrangler types` 不會產生，這裡手動補上。
interface CloudflareEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** 32 bytes base64，用於包裝每位使用者的資料金鑰（envelope encryption） */
  MASTER_ENCRYPTION_KEY: string;
  /** 允許登入的 Email（逗號分隔）；未設定則任何 Google 帳號皆可登入 */
  ALLOWED_EMAILS?: string;
  OPENROUTER_API_KEY?: string;
}
