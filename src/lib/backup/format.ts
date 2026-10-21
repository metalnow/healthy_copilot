// 備份格式（純函式）：
//   資料表原始列（D1 欄位名稱與值）→ JSON 檔 → ZIP（含 checksums.json）→ AES-256-GCM 加密
//   加密檔格式：4 bytes 魔術字 "HCB1" + 12 bytes IV + 密文

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { fromBase64Url, randomBytes, sha256Hex, toBase64Url } from "@/lib/crypto";

export const BACKUP_FORMAT_VERSION = 1;
export const APP_VERSION = "0.1.0";
const MAGIC = new Uint8Array([0x48, 0x43, 0x42, 0x31]); // "HCB1"
const AAD = new TextEncoder().encode("healthy-copilot-backup:v1");

export type Row = Record<string, unknown>;

/**
 * 備份的資料表，依「先父後子」的順序排列（還原時依序寫入、反序刪除）。
 * owner：直接以 user_id 過濾；否則透過父表的外鍵找出屬於使用者的列。
 */
export const BACKUP_TABLES = [
  { file: "media-objects.json", table: "media_objects", owner: "user_id" },
  { file: "ai-extractions.json", table: "ai_extractions", owner: "user_id" },
  { file: "health-documents.json", table: "health_documents", owner: "user_id" },
  { file: "lab-observations.json", table: "lab_observations", owner: "user_id" },
  { file: "profile.json", table: "health_profiles", owner: "user_id" },
  { file: "settings.json", table: "user_settings", owner: "user_id" },
  { file: "goals.json", table: "health_goals", owner: "user_id" },
  { file: "observations.json", table: "observations", owner: "user_id" },
  { file: "food-events.json", table: "food_events", owner: "user_id" },
  { file: "food-items.json", table: "food_items", parent: { table: "food_events", fk: "food_event_id" } },
  { file: "drink-events.json", table: "drink_events", owner: "user_id" },
  { file: "medications.json", table: "medications", owner: "user_id" },
  { file: "medication-schedules.json", table: "medication_schedules", parent: { table: "medications", fk: "medication_id" } },
  { file: "medication-events.json", table: "medication_events", owner: "user_id" },
  { file: "sleep.json", table: "sleep_sessions", owner: "user_id" },
  { file: "activity.json", table: "activity_daily", owner: "user_id" },
  { file: "exercise.json", table: "exercise_sessions", owner: "user_id" },
  { file: "symptoms.json", table: "symptom_events", owner: "user_id" },
  { file: "ai-reviews.json", table: "ai_reviews", owner: "user_id" },
  { file: "experiments.json", table: "experiments", owner: "user_id" },
  { file: "experiment-events.json", table: "experiment_events", parent: { table: "experiments", fk: "experiment_id" } },
  { file: "integrations.json", table: "integrations", owner: "user_id" },
] as const satisfies readonly ({ file: string; table: string } & (
  | { owner: "user_id" }
  | { parent: { table: string; fk: string } }
))[];

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupManifest = {
  formatVersion: number;
  appVersion: string;
  createdAt: string;
  userId: string;
  timezone: string;
  recordCounts: Record<string, number>;
  includesMedia: boolean;
  mediaSkipped: number;
  encrypted: boolean;
};

export type BackupContents = {
  manifest: BackupManifest;
  tables: Record<string, Row[]>;
  /** media/<media id>：原始檔內容 */
  media: Record<string, Uint8Array>;
};

export async function buildArchive(contents: BackupContents): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const { file } of BACKUP_TABLES) {
    files[file] = strToU8(JSON.stringify(contents.tables[file] ?? []));
  }
  for (const [id, bytes] of Object.entries(contents.media)) files[`media/${id}`] = bytes;
  files["manifest.json"] = strToU8(JSON.stringify(contents.manifest, null, 2));

  const checksums: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) {
    checksums[name] = await sha256Hex(new Uint8Array(bytes));
  }
  files["checksums.json"] = strToU8(JSON.stringify(checksums, null, 2));
  return zipSync(files, { level: 6 });
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupFormatError";
  }
}

export async function parseArchive(zip: Uint8Array): Promise<BackupContents> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch {
    throw new BackupFormatError("備份檔不是有效的壓縮檔");
  }
  const read = (name: string) => {
    const bytes = files[name];
    if (!bytes) throw new BackupFormatError(`備份檔缺少 ${name}`);
    return JSON.parse(strFromU8(bytes));
  };

  const checksums = read("checksums.json") as Record<string, string>;
  for (const [name, expected] of Object.entries(checksums)) {
    const bytes = files[name];
    if (!bytes || (await sha256Hex(new Uint8Array(bytes))) !== expected) {
      throw new BackupFormatError(`檢查碼不符：${name}`);
    }
  }

  const manifest = read("manifest.json") as BackupManifest;
  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupFormatError(`不支援的備份格式版本 ${manifest.formatVersion}`);
  }
  const tables: Record<string, Row[]> = {};
  for (const { file } of BACKUP_TABLES) tables[file] = files[file] ? (read(file) as Row[]) : [];
  const media: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(files)) {
    if (name.startsWith("media/")) media[name.slice("media/".length)] = bytes;
  }
  return { manifest, tables, media };
}

// ─── 加密 ──────────────────────────────────────────────────

export async function encryptBackup(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = randomBytes(12);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, new Uint8Array(plaintext)),
  );
  const out = new Uint8Array(MAGIC.length + iv.length + ciphertext.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(ciphertext, MAGIC.length + iv.length);
  return out;
}

export function isEncryptedBackup(bytes: Uint8Array) {
  return MAGIC.every((b, i) => bytes[i] === b);
}

/** 解密失敗（金鑰不符或檔案損毀）時丟出 BackupFormatError */
export async function decryptBackup(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  if (!isEncryptedBackup(data)) throw new BackupFormatError("不是加密的備份檔");
  const iv = data.slice(MAGIC.length, MAGIC.length + 12);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, data.slice(MAGIC.length + 12)),
    );
  } catch {
    throw new BackupFormatError("無法解密：金鑰不符或檔案已損毀");
  }
}

// ─── 復原金鑰 ──────────────────────────────────────────────

const RECOVERY_PREFIX = "hcrk1-";

export async function exportRecoveryKey(key: CryptoKey): Promise<string> {
  return RECOVERY_PREFIX + toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function importRecoveryKey(value: string): Promise<CryptoKey> {
  const trimmed = value.trim();
  if (!trimmed.startsWith(RECOVERY_PREFIX)) throw new BackupFormatError("復原金鑰格式不正確");
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64Url(trimmed.slice(RECOVERY_PREFIX.length));
  } catch {
    throw new BackupFormatError("復原金鑰格式不正確");
  }
  if (raw.byteLength !== 32) throw new BackupFormatError("復原金鑰格式不正確");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
}

// ─── 還原 ──────────────────────────────────────────────────

/** 把備份中的列改成屬於目前使用者（user_id 與 R2 路徑） */
export function remapRows(rows: Row[], fromUserId: string, toUserId: string): Row[] {
  return rows.map((row) => {
    const next: Row = { ...row };
    if ("user_id" in next) next.user_id = toUserId;
    if (typeof next.r2_key === "string") {
      next.r2_key = next.r2_key.replace(`users/${fromUserId}/`, `users/${toUserId}/`);
    }
    return next;
  });
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * 以 json_each 一次插入多列：每個語句只綁定一個 JSON 參數，避開 D1 的 100 參數上限；
 * 依 JSON 長度分批，避免超過語句大小限制。
 */
export function buildInsertStatements(table: string, columns: string[], rows: Row[], maxJsonBytes = 80_000) {
  if (!IDENTIFIER.test(table) || !columns.every((c) => IDENTIFIER.test(c))) {
    throw new BackupFormatError("備份檔包含不合法的欄位名稱");
  }
  const sql =
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) ` +
    `SELECT ${columns.map((c) => `json_extract(value, '$.${c}')`).join(", ")} FROM json_each(?)`;

  const statements: { sql: string; json: string }[] = [];
  let batch: Row[] = [];
  let size = 2;
  for (const row of rows) {
    const picked = Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));
    const length = JSON.stringify(picked).length + 1;
    if (batch.length > 0 && size + length > maxJsonBytes) {
      statements.push({ sql, json: JSON.stringify(batch) });
      batch = [];
      size = 2;
    }
    batch.push(picked);
    size += length;
  }
  if (batch.length > 0) statements.push({ sql, json: JSON.stringify(batch) });
  return statements;
}

/** 還原會取代所有資料，需輸入此文字確認 */
export const RESTORE_CONFIRM_TEXT = "取代";
