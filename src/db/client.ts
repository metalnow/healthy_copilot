import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// 不含 "server-only"，讓 Worker 的 cron / queue handler 也能使用。

export type Db = ReturnType<typeof createDb>;

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
