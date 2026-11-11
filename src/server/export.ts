// 資料匯出（未加密 ZIP）。含原始檔時可能有數十 MB：以串流產生，一次只讀一個檔案。
// 不依賴 next/*：正式環境由 Worker 入口直接處理，避免經過框架時被整份緩衝在記憶體。
import { createDb } from "@/db/client";
import { recordAudit } from "@/lib/audit";
import { streamArchive } from "@/lib/backup/format";
import { toLocalDate } from "@/lib/time";
import { exportUserData } from "./backup";
import { sessionTokenFromCookie, validateSessionToken, type SessionUser } from "./session-lookup";

export const EXPORT_PATH = "/api/backup/export";

export async function exportResponse(env: Pick<CloudflareEnv, "DB" | "MEDIA">, user: SessionUser, includeMedia: boolean) {
  const { manifest, tables } = await exportUserData(env, user, { includeMedia: false, encrypted: false });
  const mediaRows = includeMedia ? tables["media-objects.json"] : [];
  const keys = new Map(mediaRows.map((row) => [String(row.id), String(row.r2_key)]));
  const body = streamArchive({
    manifest: { ...manifest, includesMedia: includeMedia },
    tables,
    mediaIds: [...keys.keys()],
    loadMedia: async (id) => {
      const object = await env.MEDIA.get(keys.get(id)!);
      return object ? new Uint8Array(await object.arrayBuffer()) : null;
    },
  });
  await recordAudit(createDb(env.DB), { userId: user.id, action: "data.export", metadata: { includeMedia } });

  const date = toLocalDate(new Date(), user.timezone).replace(/-/g, "");
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="healthy-copilot-export-${date}${includeMedia ? "-media" : ""}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** Worker 入口用：自行驗證 session cookie */
export async function handleExportRequest(request: Request, env: CloudflareEnv) {
  const token = sessionTokenFromCookie(request.headers.get("Cookie"));
  const session = token ? await validateSessionToken(createDb(env.DB), token) : null;
  if (!session) {
    return Response.json({ error: "請先登入" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return exportResponse(env, session.user, new URL(request.url).searchParams.get("media") === "1");
}
