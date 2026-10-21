import { describe, expect, it } from "vitest";
import {
  BACKUP_TABLES,
  buildArchive,
  buildInsertStatements,
  decryptBackup,
  encryptBackup,
  exportRecoveryKey,
  importRecoveryKey,
  isEncryptedBackup,
  parseArchive,
  remapRows,
  type BackupContents,
} from "./format";

async function newKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

const contents: BackupContents = {
  manifest: {
    formatVersion: 1,
    appVersion: "0.1.0",
    createdAt: "2026-10-21T00:00:00.000Z",
    userId: "old-user",
    timezone: "Asia/Taipei",
    recordCounts: { observations: 1 },
    includesMedia: true,
    mediaSkipped: 0,
    encrypted: true,
  },
  tables: {
    "observations.json": [{ id: "o1", user_id: "old-user", values: '{"weight":85}', verified_by_user: 1 }],
  },
  media: { m1: new Uint8Array([1, 2, 3]) },
};

describe("backup format", () => {
  it("每個資料表檔名唯一", () => {
    expect(new Set(BACKUP_TABLES.map((t) => t.file)).size).toBe(BACKUP_TABLES.length);
  });

  it("壓縮 → 加密 → 解密 → 解壓，內容一致", async () => {
    const key = await newKey();
    const encrypted = await encryptBackup(key, await buildArchive(contents));
    expect(isEncryptedBackup(encrypted)).toBe(true);
    const parsed = await parseArchive(await decryptBackup(key, encrypted));
    expect(parsed.manifest.userId).toBe("old-user");
    expect(parsed.tables["observations.json"]).toEqual(contents.tables["observations.json"]);
    expect(parsed.tables["food-events.json"]).toEqual([]);
    expect(Array.from(parsed.media.m1)).toEqual([1, 2, 3]);
  });

  it("金鑰不符時無法解密", async () => {
    const encrypted = await encryptBackup(await newKey(), await buildArchive(contents));
    await expect(decryptBackup(await newKey(), encrypted)).rejects.toThrow("無法解密");
  });

  it("內容被竄改時檢查碼不符", async () => {
    const { unzipSync, zipSync, strToU8 } = await import("fflate");
    const files = unzipSync(await buildArchive(contents));
    files["observations.json"] = strToU8("[]");
    await expect(parseArchive(zipSync(files))).rejects.toThrow("檢查碼不符");
  });

  it("復原金鑰可以匯出再匯入", async () => {
    const key = await newKey();
    const recovery = await exportRecoveryKey(key);
    expect(recovery.startsWith("hcrk1-")).toBe(true);
    const encrypted = await encryptBackup(key, new Uint8Array([9]));
    expect(Array.from(await decryptBackup(await importRecoveryKey(recovery), encrypted))).toEqual([9]);
    await expect(importRecoveryKey("abc")).rejects.toThrow("格式不正確");
  });

  it("還原時改成目前使用者", () => {
    expect(
      remapRows([{ id: "m1", user_id: "old", r2_key: "users/old/food_photo/2026-10/m1.jpg" }, { id: "x" }], "old", "new"),
    ).toEqual([{ id: "m1", user_id: "new", r2_key: "users/new/food_photo/2026-10/m1.jpg" }, { id: "x" }]);
  });

  it("json_each 插入語句依大小分批，且拒絕不合法的欄位名稱", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: `r${i}`, note: "x".repeat(100), extra: "ignored" }));
    const statements = buildInsertStatements("observations", ["id", "note"], rows, 2000);
    expect(statements.length).toBeGreaterThan(1);
    expect(statements.flatMap((s) => JSON.parse(s.json))).toHaveLength(50);
    expect(statements[0].sql).toContain(`FROM json_each(?)`);
    expect(JSON.parse(statements[0].json)[0]).toEqual({ id: "r0", note: "x".repeat(100) });
    expect(() => buildInsertStatements("observations; DROP TABLE users", ["id"], rows)).toThrow();
    expect(() => buildInsertStatements("observations", ["id) --"], rows)).toThrow();
  });
});
