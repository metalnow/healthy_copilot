"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, getEnv } from "@/db";
import { userSettings } from "@/db/schema";
import { exportRecoveryKey } from "@/lib/backup/format";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { deleteSessionCookie } from "@/lib/auth/session";
import { BACKUP_FREQUENCIES } from "@/lib/enums";
import { formString, type ActionState } from "@/lib/form";
import { deleteAccount, runBackup } from "@/server/backup";
import { disconnectDrive } from "@/server/google-drive";
import { getUserDataKey } from "@/server/keys";

export async function updateBackupSettings(formData: FormData) {
  const user = await requireUser();
  const frequency = z.enum(BACKUP_FREQUENCIES).safeParse(formString(formData, "frequency"));
  if (!frequency.success) return;
  const db = await getDb();
  await db
    .update(userSettings)
    .set({ backupFrequency: frequency.data, backupIncludeMedia: formData.get("includeMedia") === "on" })
    .where(eq(userSettings.userId, user.id));
  await recordAudit(db, { userId: user.id, action: "settings.backup", metadata: { frequency: frequency.data } });
  revalidatePath("/settings/data");
}

export async function backupNow() {
  const user = await requireUser();
  const db = await getDb();
  const result = await runBackup(db, await getEnv(), user.id, "manual");
  await recordAudit(db, { userId: user.id, action: "backup.manual", entityId: result.id, metadata: { ok: result.ok } });
  redirect(`/settings/data?backup=${result.ok ? "ok" : (result.error ?? "failed")}`);
}

export async function disconnectDriveAction() {
  const user = await requireUser();
  const db = await getDb();
  await disconnectDrive(db, await getEnv(), user.id);
  await recordAudit(db, { userId: user.id, action: "google_drive.disconnect" });
  revalidatePath("/settings/data");
}

/** 顯示復原金鑰（使用者自行保管，用於伺服器金鑰遺失或跨帳號還原） */
export async function revealRecoveryKey(): Promise<string> {
  const user = await requireUser();
  const db = await getDb();
  const key = await getUserDataKey(db, await getEnv(), user.id, { extractable: true });
  await recordAudit(db, { userId: user.id, action: "recovery_key.reveal" });
  return exportRecoveryKey(key);
}

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if ((formString(formData, "confirmEmail") ?? "").toLowerCase() !== user.email.toLowerCase()) {
    return { error: "請輸入你的 Email 以確認刪除" };
  }
  const db = await getDb();
  const env = await getEnv();
  await disconnectDrive(db, env, user.id);
  await deleteAccount(db, env, user.id);
  // 帳號已刪除，稽核紀錄不再關聯使用者
  await recordAudit(db, { userId: null, action: "account.delete" });
  await deleteSessionCookie();
  redirect("/login?deleted=1");
}
