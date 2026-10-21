<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 專案慣例

- 專案說明與決策：`docs/plan.md`、`docs/architecture.md`；原始規格 `docs/spec-v1.md`。
- 部署在 Cloudflare Workers（OpenNext），資料庫為 D1（SQLite）。不要使用 Node 專屬 API 或需要原生模組的套件。
- 需要登入的資料存取一律經過 `src/lib/auth/dal.ts` 的 `requireUser()`，查詢務必以 `userId` 過濾。
- 修改 `src/db/schema.ts` 後執行 `npm run db:generate` 並 commit 產生的 migration。
- `src/server/**` 也會被 Worker 的 cron / queue handler 使用：不可 import `next/*` 或 `server-only`。
- D1 每個查詢最多 100 個參數：多列 insert 用 `src/db/batch.ts` 的 `chunkForInsert`。
- 列舉值放 `src/lib/enums.ts`，讓 DB 與 Zod 共用。
- 事件時間存 UTC ISO + `local_date` + `timezone`（用 `src/lib/time.ts`）。
- 稽核紀錄與 log 不可包含健康內容。AI 估算值必須標示來源與信心值，並經使用者確認。
- AI 一律經 `src/lib/ai/openrouter.ts`（帶 ZDR 隱私參數），結果先存 `ai_extractions`、經使用者確認才寫入紀錄；
  送給模型的內容不得包含使用者身分資訊。
- 介面只做繁體中文。
- 提交前執行 `npm run check`。
