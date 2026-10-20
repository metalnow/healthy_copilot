// Cloudflare Worker 入口：沿用 OpenNext 產生的 fetch handler，另外掛上 cron 與 queue handler。
// 參考：https://opennext.js.org/cloudflare/howtos/custom-worker

// 建置前檔案不存在、建置後為無型別的 JS，兩種情況都要能通過型別檢查，因此用 @ts-ignore
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` 於 `opennextjs-cloudflare build` 時產生
import { default as handler } from "./.open-next/worker.js";
import { handleQueue } from "./src/jobs/queue";
import { handleScheduled, type JobMessage } from "./src/jobs/scheduled";

export default {
  fetch: handler.fetch,

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduled(controller, env));
  },

  async queue(batch) {
    await handleQueue(batch);
  },
} satisfies ExportedHandler<CloudflareEnv, JobMessage>;

