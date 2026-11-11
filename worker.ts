// Cloudflare Worker 入口：沿用 OpenNext 產生的 fetch handler，另外掛上 cron 與 queue handler。
// 參考：https://opennext.js.org/cloudflare/howtos/custom-worker

// 建置前檔案不存在、建置後為無型別的 JS，兩種情況都要能通過型別檢查，因此用 @ts-ignore
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` 於 `opennextjs-cloudflare build` 時產生
import { default as handler } from "./.open-next/worker.js";
import { handleQueue } from "./src/jobs/queue";
import { EXPORT_PATH, handleExportRequest } from "./src/server/export";
import { handleScheduled } from "./src/jobs/scheduled";
import type { JobMessage } from "./src/jobs/types";

export default {
  fetch(request, env, ctx) {
    // 資料匯出（可能數十 MB）直接串流回應，不經 Next.js，避免整份被緩衝在記憶體
    if (request.method === "GET" && new URL(request.url).pathname === EXPORT_PATH) {
      return handleExportRequest(request, env);
    }
    return handler.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduled(controller, env));
  },

  async queue(batch, env) {
    await handleQueue(batch, env);
  },
} satisfies ExportedHandler<CloudflareEnv, JobMessage>;

