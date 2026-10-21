import { NextResponse, type NextRequest } from "next/server";
import { getDb, getEnv } from "@/db";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/dal";
import { RESTORE_CONFIRM_TEXT } from "@/lib/backup/format";
import { BackupFormatError, openBackup, previewOf, restoreBackup } from "@/server/backup";
import { DriveNotConnectedError, getDriveClient } from "@/server/google-drive";
import { isSameOrigin, jsonError } from "@/server/http";

const MAX_BYTES = 80 * 1024 * 1024;

/**
 * 預覽或還原備份。來源為 Google Drive 上的備份（fileId）或使用者上傳的檔案。
 * 還原會以備份取代目前所有健康資料，必須輸入確認文字。
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("不允許的來源", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("請先登入", 401);

  const form = await request.formData();
  const mode = form.get("mode") === "restore" ? "restore" : "preview";
  const fileId = String(form.get("fileId") ?? "");
  const file = form.get("file");
  const recoveryKey = String(form.get("recoveryKey") ?? "").trim() || undefined;
  if (mode === "restore" && form.get("confirm") !== RESTORE_CONFIRM_TEXT) {
    return jsonError(`請輸入「${RESTORE_CONFIRM_TEXT}」確認`, 400);
  }

  const db = await getDb();
  const env = await getEnv();
  try {
    let data: Uint8Array;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return jsonError("備份檔太大", 413);
      data = new Uint8Array(await file.arrayBuffer());
    } else if (fileId) {
      data = await (await getDriveClient(db, env, user.id)).download(fileId);
    } else {
      return jsonError("請選擇備份", 400);
    }

    const contents = await openBackup(db, env, user.id, data, recoveryKey);
    if (mode === "preview") return NextResponse.json({ preview: previewOf(contents) });

    const result = await restoreBackup(env, user.id, contents);
    await recordAudit(db, {
      userId: user.id,
      action: "data.restore",
      metadata: { source: fileId ? "drive" : "file", backupCreatedAt: contents.manifest.createdAt },
    });
    return NextResponse.json({ restored: true, ...result });
  } catch (error) {
    if (error instanceof BackupFormatError) {
      const needsKey = error.message.includes("無法解密");
      return NextResponse.json(
        { error: needsKey ? "無法用目前帳號的金鑰解密，請輸入這份備份的復原金鑰" : error.message, needsRecoveryKey: needsKey },
        { status: 400 },
      );
    }
    if (error instanceof DriveNotConnectedError) return jsonError(error.message, 400);
    console.error("restore failed", error instanceof Error ? error.name : "unknown");
    return jsonError("還原失敗，資料未變更", 500);
  }
}
