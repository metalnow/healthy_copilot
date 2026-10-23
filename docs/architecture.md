# 架構

```text
瀏覽器（手機 / 桌機）
   │  pdf.js 轉圖、照片縮圖、錄音
   ▼
Cloudflare Worker（worker.ts）
   ├─ fetch     → OpenNext（Next.js App Router）
   │               ├─ 頁面（Server Components）
   │               └─ /api/*（Route Handlers）
   ├─ scheduled → src/jobs/scheduled.ts（每小時，依使用者時區派工）
   └─ queue     → src/jobs/queue.ts（AI 擷取、週回顧）
        │
        ├─ D1  (DB)        結構化健康資料（Source of Truth）
        ├─ R2  (MEDIA)     健檢報告、食物照片、睡眠截圖、語音
        ├─ Queue (AI_QUEUE)
        ├─ OpenRouter      VLM / LLM / ASR（Sprint 3）
        └─ Google          OIDC 登入、Drive 備份（Sprint 7）
```

## 目錄

```text
worker.ts               Worker 入口（fetch / scheduled / queue）
wrangler.jsonc          Cloudflare bindings 設定
open-next.config.ts     OpenNext 設定
drizzle/migrations/     D1 migration（由 drizzle-kit 產生）
src/
  app/
    (app)/              需登入的頁面（今日、時間軸、健康、洞察、報告、設定）
    login/              登入頁
    api/auth/           Google OAuth 與登出
  components/           共用 UI
  db/
    schema.ts           D1 資料表定義
    client.ts           createDb（Worker 與 Next 共用）
    index.ts            getDb / getEnv（僅限 Next server）
  jobs/                 cron 與 queue handler
  lib/
    auth/               session、Google OIDC、Data Access Layer
    schemas/            Zod schema（API 輸入與 AI 結構化輸出共用）
    crypto.ts           AES-256-GCM envelope encryption
    time.ts             時區與當地日期
    enums.ts            DB 與 Zod 共用列舉
    audit.ts            稽核紀錄
```

## 登入與 Session

1. `/api/auth/google`：產生 state 與 PKCE verifier（存 HttpOnly cookie），導向 Google，只要求 `openid email profile`。
2. `/api/auth/google/callback`：驗證 state、交換 code、解析 ID token、檢查 `ALLOWED_EMAILS`。
3. 新使用者：在同一個 D1 batch 中建立 `users`、`user_keys`（包裝後的 DEK）、`user_settings`。
4. 建立 session：隨機 token 放 cookie（`hc_session`，HttpOnly、SameSite=Lax），資料庫只存 SHA-256，30 天到期。
5. 頁面一律經 `src/lib/auth/dal.ts` 的 `requireUser()` 取得使用者。

Next 16 預設的 Cache Components 未啟用：所有頁面都是個人化健康資料，不在伺服器端快取。

## AI 流程

```text
瀏覽器：拍照（縮圖）/ 錄音 / 文字
   │ POST /api/ai/{food-photo,voice,text}（驗證登入、同源）
   ▼
src/server/ai/tasks.ts
   ├─ 原始檔存 R2，建立 ai_extractions（pending）
   ├─ OpenRouter（zdr、data_collection=deny）
   │    vision → 照片辨識；asr → 轉文字；fast → 結構化
   ├─ Zod 驗證，不符則回饋錯誤重試
   └─ ai_extractions（succeeded，含用量與耗時）→ 回傳可編輯草稿
   ▼
使用者確認 / 修改 → confirmAiDraft → 寫入各紀錄表（source、confidence、extraction_id）
```

模型依用途（`fast`、`vision`、`asr`、`reasoning`、`medical_summary`）設定，預設值在
`src/lib/ai/model-profiles.ts`，可在「設定 → AI 模型」覆寫（存於 `model_profiles`）。

### 身分資料不送給 AI

健檢報告、藥袋等文件常印有姓名、生日、身分證、病歷號，送出前先在瀏覽器處理：

- 文字型 PDF：pdf.js 抽出文字，`src/lib/privacy/redact.ts` 移除身分欄位後連同原檔上傳；
  佇列處理時伺服器再移除一次，只把文字送給模型（原始 PDF 不送出）。
- 照片與掃描型 PDF（轉成圖片）：使用者在 `ImageMasker` 塗黑表頭、頁尾等區域，上傳與保存的都是塗黑後的圖片。

## 加密

- `MASTER_ENCRYPTION_KEY`（Worker secret）只用來包裝每位使用者的 DEK。
- DEK 以 AAD `dek:<userId>` 綁定使用者，無法挪用給其他帳號。
- OAuth token、Drive 備份等以 DEK 加密，格式 `v1.<iv>.<ciphertext>`。
