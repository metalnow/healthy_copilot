import type { NextRequest } from "next/server";
import { getDb, getEnv } from "@/db";
import { streamArchive } from "@/lib/backup/format";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/dal";
import { toLocalDate } from "@/lib/time";
import { exportUserData } from "@/server/backup";
import { jsonError } from "@/server/http";

/**
 * 匯出全部資料（未加密 ZIP，供使用者自行保存或攜帶到其他服務）。
 * 含原始檔時可能有數十 MB：以串流方式產生，一次只讀一個檔案，避免超過 Worker 的記憶體上限。
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("請先登入", 401);
  const includeMedia = request.nextUrl.searchParams.get("media") === "1";

  const env = await getEnv();
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
  await recordAudit(await getDb(), { userId: user.id, action: "data.export", metadata: { includeMedia } });

  const date = toLocalDate(new Date(), user.timezone).replace(/-/g, "");
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="healthy-copilot-export-${date}${includeMedia ? "-media" : ""}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
