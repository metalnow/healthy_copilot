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

第一次部署前建立資源：

```bash
npx wrangler d1 create healthy-copilot          # 把回傳的 database_id 填入 wrangler.jsonc
npx wrangler r2 bucket create healthy-copilot-media
npx wrangler queues create healthy-copilot-ai
npx wrangler queues create healthy-copilot-ai-dlq

npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put MASTER_ENCRYPTION_KEY    # openssl rand -base64 32，請另外妥善保存
npx wrangler secret put ALLOWED_EMAILS           # 例如 you@gmail.com

npm run db:migrate:remote
npm run deploy
```

Cron Triggers、Queues 與較長的 CPU 時間需要 Workers 付費方案。
