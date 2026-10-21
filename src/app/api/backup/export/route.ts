import type { NextRequest } from "next/server";
import { getDb, getEnv } from "@/db";
import { buildArchive } from "@/lib/backup/format";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/dal";
import { toLocalDate } from "@/lib/time";
import { exportUserData } from "@/server/backup";
import { jsonError } from "@/server/http";

/** 匯出全部資料（未加密 ZIP，供使用者自行保存或攜帶到其他服務） */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError("請先登入", 401);
  const includeMedia = request.nextUrl.searchParams.get("media") === "1";

  const contents = await exportUserData(await getEnv(), user, { includeMedia, encrypted: false });
  const zip = await buildArchive(contents);
  await recordAudit(await getDb(), { userId: user.id, action: "data.export", metadata: { includeMedia } });

  const date = toLocalDate(new Date(), user.timezone).replace(/-/g, "");
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="healthy-copilot-export-${date}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
