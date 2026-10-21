import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { googleDriveBackups, mediaObjects, users, userSettings } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import {
  APP_VERSION,
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  buildArchive,
  buildInsertStatements,
  decryptBackup,
  encryptBackup,
  importRecoveryKey,
  isEncryptedBackup,
  parseArchive,
  remapRows,
  type BackupContents,
  type Row,
} from "@/lib/backup/format";
import { DRIVE_ROOT_FOLDER, type DriveClient } from "@/lib/google-drive";
import { BackupFormatError } from "@/lib/backup/format";
import { getDriveClient } from "./google-drive";
import { getUserDataKey } from "./keys";

type Env = Pick<CloudflareEnv, "DB" | "MEDIA" | "MASTER_ENCRYPTION_KEY" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">;

/** 含媒體時的總量上限，避免超過 Worker 記憶體 */
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
/** Drive 上保留的備份份數 */
export const KEEP_BACKUPS = 10;
const BACKUP_EXTENSION = ".hcbackup";

function selectSql(table: BackupTable) {
  if ("owner" in table) return `SELECT * FROM "${table.table}" WHERE user_id = ?`;
  return `SELECT c.* FROM "${table.table}" c JOIN "${table.parent.table}" p ON c."${table.parent.fk}" = p.id WHERE p.user_id = ?`;
}
type BackupTable = (typeof BACKUP_TABLES)[number];

/** 匯出使用者所有資料（D1 原始欄位與值） */
export async function exportUserData(
  env: Pick<Env, "DB" | "MEDIA">,
  user: { id: string; timezone: string },
  options: { includeMedia: boolean; encrypted: boolean },
): Promise<BackupContents> {
  const results = await env.DB.batch(BACKUP_TABLES.map((t) => env.DB.prepare(selectSql(t)).bind(user.id)));
  const tables: Record<string, Row[]> = {};
  BACKUP_TABLES.forEach((t, i) => (tables[t.file] = (results[i].results ?? []) as Row[]));

  const media: Record<string, Uint8Array> = {};
  let mediaSkipped = 0;
  if (options.includeMedia) {
    let total = 0;
    for (const row of tables["media-objects.json"]) {
      const size = Number(row.size_bytes ?? 0);
      if (total + size > MAX_MEDIA_BYTES) {
        mediaSkipped++;
        continue;
      }
      const object = await env.MEDIA.get(String(row.r2_key));
      if (!object) continue;
      media[String(row.id)] = new Uint8Array(await object.arrayBuffer());
      total += size;
    }
  }

  return {
    manifest: {
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: APP_VERSION,
      createdAt: new Date().toISOString(),
      userId: user.id,
      timezone: user.timezone,
      recordCounts: Object.fromEntries(BACKUP_TABLES.map((t) => [t.file.replace(".json", ""), tables[t.file].length])),
      includesMedia: options.includeMedia,
      mediaSkipped,
      encrypted: options.encrypted,
    },
    tables,
    media,
  };
}

function backupFileName(date: Date) {
  return `${date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}${BACKUP_EXTENSION}`;
}

async function driveFolders(drive: DriveClient) {
  const root = await drive.ensureFolder(DRIVE_ROOT_FOLDER);
  const backups = await drive.ensureFolder("backups", root);
  return { root, backups };
}

/** 加密備份並上傳 Google Drive；回傳備份紀錄 id */
export async function runBackup(db: Db, env: Env, userId: string, trigger: "manual" | "scheduled", doFetch?: typeof fetch) {
  const [user] = await db.select({ id: users.id, timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const includeMedia = settings?.backupIncludeMedia ?? false;

  const createdAt = new Date();
  const fileName = backupFileName(createdAt);
  const [record] = await db
    .insert(googleDriveBackups)
    .values({ userId, fileName, formatVersion: BACKUP_FORMAT_VERSION, includesMedia: includeMedia, trigger })
    .returning({ id: googleDriveBackups.id });

  try {
    const drive = await getDriveClient(db, env, userId, doFetch);
    const contents = await exportUserData(env, user, { includeMedia, encrypted: true });
    const encrypted = await encryptBackup(await getUserDataKey(db, env, userId), await buildArchive(contents));
    const checksum = await sha256Hex(new Uint8Array(encrypted));

    const folders = await driveFolders(drive);
    const file = await drive.upload({
      name: fileName,
      parentId: folders.backups,
      mimeType: "application/octet-stream",
      bytes: encrypted,
      appProperties: { hcBackup: "1", formatVersion: String(BACKUP_FORMAT_VERSION) },
    });

    // 根目錄的 manifest.json 只放不含健康內容的中繼資料
    const manifest = new TextEncoder().encode(
      JSON.stringify(
        {
          formatVersion: BACKUP_FORMAT_VERSION,
          appVersion: APP_VERSION,
          latestBackup: { fileName, createdAt: createdAt.toISOString(), sizeBytes: encrypted.byteLength, sha256: checksum },
          includesMedia: includeMedia,
          encrypted: true,
        },
        null,
        2,
      ),
    );
    const [existingManifest] = await drive.list(`name = 'manifest.json' and '${folders.root}' in parents and trashed = false`);
    if (existingManifest) await drive.updateContent(existingManifest.id, "application/json", manifest);
    else await drive.upload({ name: "manifest.json", parentId: folders.root, mimeType: "application/json", bytes: manifest });

    // 只保留最近幾份
    const backups = await listDriveBackups(drive, folders.backups);
    for (const old of backups.slice(KEEP_BACKUPS)) await drive.delete(old.id);

    await db
      .update(googleDriveBackups)
      .set({
        status: "succeeded",
        driveFileId: file.id,
        sizeBytes: encrypted.byteLength,
        checksum,
        recordCounts: contents.manifest.recordCounts,
        completedAt: new Date(),
      })
      .where(eq(googleDriveBackups.id, record.id));
    return { id: record.id, ok: true as const };
  } catch (error) {
    const message = error instanceof Error && error.name === "DriveNotConnectedError" ? "drive_not_connected" : "backup_failed";
    await db
      .update(googleDriveBackups)
      .set({ status: "failed", error: message, completedAt: new Date() })
      .where(eq(googleDriveBackups.id, record.id));
    return { id: record.id, ok: false as const, error: message };
  }
}

export async function listDriveBackups(drive: DriveClient, folderId?: string) {
  const parent = folderId ?? (await driveFolders(drive)).backups;
  const files = await drive.list(`'${parent}' in parents and trashed = false`);
  return files.filter((f) => f.name.endsWith(BACKUP_EXTENSION));
}

export async function backupHistory(db: Db, userId: string, limit = 10) {
  return db
    .select()
    .from(googleDriveBackups)
    .where(eq(googleDriveBackups.userId, userId))
    .orderBy(desc(googleDriveBackups.createdAt))
    .limit(limit);
}

/** 解密並解析備份；可用自己的金鑰或使用者提供的復原金鑰 */
export async function openBackup(db: Db, env: Env, userId: string, data: Uint8Array, recoveryKey?: string) {
  if (!isEncryptedBackup(data)) return parseArchive(data);
  const key = recoveryKey ? await importRecoveryKey(recoveryKey) : await getUserDataKey(db, env, userId);
  return parseArchive(await decryptBackup(key, data));
}

/**
 * 以備份取代目前所有健康資料（帳號、登入 session、金鑰與 Drive 授權不受影響）。
 * 刪除與寫入在同一個 D1 batch（同一個交易）中完成。
 */
export async function restoreBackup(env: Env, userId: string, contents: BackupContents) {
  const columnsResult = await env.DB.batch(
    BACKUP_TABLES.map((t) => env.DB.prepare(`SELECT name FROM pragma_table_info('${t.table}')`)),
  );
  const tableColumns = new Map(
    BACKUP_TABLES.map((t, i) => [t.table, new Set((columnsResult[i].results as { name: string }[]).map((r) => r.name))]),
  );

  const statements: D1PreparedStatement[] = [];
  for (const table of [...BACKUP_TABLES].reverse()) {
    const sql =
      "owner" in table
        ? `DELETE FROM "${table.table}" WHERE user_id = ?`
        : `DELETE FROM "${table.table}" WHERE "${table.parent.fk}" IN (SELECT id FROM "${table.parent.table}" WHERE user_id = ?)`;
    statements.push(env.DB.prepare(sql).bind(userId));
  }

  const fromUserId = contents.manifest.userId;
  for (const table of BACKUP_TABLES) {
    const rows = remapRows(contents.tables[table.file] ?? [], fromUserId, userId);
    if (rows.length === 0) continue;
    // 只寫入目前資料表存在、且備份中有的欄位（舊版備份缺少的欄位使用預設值）
    const known = tableColumns.get(table.table)!;
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => known.has(c));
    for (const { sql, json } of buildInsertStatements(table.table, columns, rows)) {
      statements.push(env.DB.prepare(sql).bind(json));
    }
  }
  if (contents.manifest.timezone) {
    statements.push(env.DB.prepare("UPDATE users SET timezone = ? WHERE id = ?").bind(contents.manifest.timezone, userId));
  }
  await env.DB.batch(statements);

  // 原始檔：備份中有的才寫回 R2
  const mediaRows = remapRows(contents.tables["media-objects.json"] ?? [], fromUserId, userId);
  let restoredMedia = 0;
  for (const row of mediaRows) {
    const bytes = contents.media[String(row.id)];
    if (!bytes) continue;
    await env.MEDIA.put(String(row.r2_key), bytes, { httpMetadata: { contentType: String(row.mime_type) } });
    restoredMedia++;
  }
  return { restoredMedia };
}

export function previewOf(contents: BackupContents) {
  return {
    createdAt: contents.manifest.createdAt,
    formatVersion: contents.manifest.formatVersion,
    recordCounts: contents.manifest.recordCounts,
    includesMedia: contents.manifest.includesMedia,
    mediaFiles: Object.keys(contents.media).length,
  };
}

/** 刪除帳號：R2 原始檔、所有資料列（cascade）與帳號本身 */
export async function deleteAccount(db: Db, env: Pick<Env, "MEDIA">, userId: string) {
  let cursor: string | undefined;
  do {
    const listed = await env.MEDIA.list({ prefix: `users/${userId}/`, cursor, limit: 1000 });
    if (listed.objects.length > 0) await env.MEDIA.delete(listed.objects.map((o) => o.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  // 舊路徑或還原後的媒體也一併刪除
  const media = await db.select({ key: mediaObjects.r2Key }).from(mediaObjects).where(eq(mediaObjects.userId, userId));
  if (media.length > 0) await env.MEDIA.delete(media.map((m) => m.key));
  await db.delete(users).where(eq(users.id, userId));
}

export { BackupFormatError };
