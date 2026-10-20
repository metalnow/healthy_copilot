import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, type Db } from "./client";

export { createDb, type Db };

/** 在 request 範圍內取得 Cloudflare bindings */
export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

export async function getDb(): Promise<Db> {
  return createDb((await getEnv()).DB);
}
