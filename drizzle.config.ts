import { defineConfig } from "drizzle-kit";

// 只用於產生 migration SQL；套用由 `wrangler d1 migrations apply` 負責。
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
});
