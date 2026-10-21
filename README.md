# 健康副駕（Personal Health Copilot）

以個人健檢資料為 baseline，持續記錄每日健康行為與生理量測，透過 AI 做結構化分析與週期回顧的 Web App。**非醫療診斷系統。**

- 規格：[docs/spec-v1.md](docs/spec-v1.md)
- 修正版開發計劃與決策：[docs/plan.md](docs/plan.md)
- 架構：[docs/architecture.md](docs/architecture.md)

技術：Next.js 16 · Cloudflare Workers（OpenNext）· D1 · R2 · Queues · Drizzle · Zod · Tailwind CSS

## 本機開發

需要 Node.js 22 以上。

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入 Google OAuth 與 MASTER_ENCRYPTION_KEY
npm run db:migrate:local          # 建立本機 D1
npm run dev                       # http://localhost:3000
```

Google OAuth：在 Google Cloud Console 建立「Web application」OAuth client，Authorized redirect URI 加入
`http://localhost:3000/api/auth/google/callback`（正式環境改為正式網址）。

用 Workers runtime 預覽正式建置：

```bash
npm run preview
```

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm run check` | lint + typecheck + 單元測試 |
| `npm run db:generate` | 修改 `src/db/schema.ts` 後產生 migration |
| `npm run db:migrate:local` / `db:migrate:remote` | 套用 migration 到本機 / 正式 D1 |
| `npm run cf-typegen` | 修改 `wrangler.jsonc` 後重新產生 binding 型別 |

## 部署到 Cloudflare

### 1. 建立資源（只需一次）

在 Cloudflare Dashboard 或用 wrangler 建立：

| 資源 | 名稱 |
|---|---|
| D1 | `healthy-copilot`（id 已填在 `wrangler.jsonc`） |
| R2 bucket | `healthy-copilot-media` |
| Queue | `healthy-copilot-ai`、`healthy-copilot-ai-dlq` |

```bash
npx wrangler r2 bucket create healthy-copilot-media
npx wrangler queues create healthy-copilot-ai
npx wrangler queues create healthy-copilot-ai-dlq
```

Binding 名稱以 `wrangler.jsonc` 為準（D1 為 `DB`、R2 為 `MEDIA`、Queue 為 `AI_QUEUE`），不需要在 Dashboard 另外設定。

### 2. 連結 GitHub 自動部署（Workers Builds）

Workers & Pages → Create → Import a repository，選 `metalnow/healthy_copilot`：

| 欄位 | 值 |
|---|---|
| Project name | `healthy-copilot`（必須與 `wrangler.jsonc` 的 `name` 相同） |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npm run cf:deploy`（先套用 D1 migration，再部署） |

注意：Build command 不能用 `npm run build`，那只會跑 `next build`，不會產生 Worker 需要的 `.open-next/`。

### 3. 設定 Secrets

Worker → Settings → Variables and Secrets，新增（類型選 Secret）：

| 名稱 | 值 |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `MASTER_ENCRYPTION_KEY` | `openssl rand -base64 32`，請另外妥善保存，遺失後加密資料無法還原 |
| `OPENROUTER_API_KEY` | OpenRouter API key（AI 功能）。建議在 OpenRouter 設定每月額度上限 |

允許登入的帳號（`ALLOWED_EMAILS`）與自訂網域設定在 `wrangler.jsonc`，不要只在 Dashboard 修改，否則下次部署會被覆蓋。

Google OAuth client 的 Authorized redirect URI 加入 `https://healthy-copilot.mtlnow.xyz/api/auth/google/callback`。

### 4. Google Drive 備份（選用）

在同一個 Google Cloud 專案：

1. APIs & Services → Library → 啟用 **Google Drive API**
2. OAuth consent screen → Data access（Scopes）→ 加入 `https://www.googleapis.com/auth/drive.file`

不需要新增 redirect URI（沿用登入的 callback）。之後在「設定 → 資料與備份」按「連結 Google Drive」。

### 手動部署（不經 GitHub）

```bash
npm run db:migrate:remote
npm run deploy
```

Cron Triggers、Queues 與較長的 CPU 時間可能需要 Workers 付費方案。
