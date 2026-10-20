import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// 所有頁面都是個人化的動態內容，不使用 ISR / incremental cache。
export default defineCloudflareConfig({});
