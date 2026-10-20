import { describe, expect, it } from "vitest";
import {
  createWrappedDataKey,
  decryptString,
  encryptString,
  fromBase64Url,
  importMasterKey,
  randomBytes,
  sha256Hex,
  toBase64Url,
  unwrapDataKey,
} from "./crypto";

const masterBase64 = Buffer.from(randomBytes(32)).toString("base64");

describe("crypto", () => {
  it("base64url 可以來回轉換", () => {
    const bytes = randomBytes(50);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it("接受標準 base64 的 master key", async () => {
    await expect(importMasterKey(masterBase64)).resolves.toBeDefined();
  });

  it("拒絕長度不是 32 bytes 的 key", async () => {
    await expect(importMasterKey(toBase64Url(randomBytes(16)))).rejects.toThrow();
  });

  it("envelope encryption：包裝 DEK 後可加解密", async () => {
    const master = await importMasterKey(masterBase64);
    const wrapped = await createWrappedDataKey(master, "user-1");
    const dek = await unwrapDataKey(master, wrapped, "user-1");

    const ciphertext = await encryptString(dek, "refresh-token-秘密", "oauth:drive");
    expect(ciphertext.startsWith("v1.")).toBe(true);
    expect(ciphertext).not.toContain("refresh");
    await expect(decryptString(dek, ciphertext, "oauth:drive")).resolves.toBe(
      "refresh-token-秘密",
    );
  });

  it("DEK 綁定 userId，換成其他使用者無法解開", async () => {
    const master = await importMasterKey(masterBase64);
    const wrapped = await createWrappedDataKey(master, "user-1");
    await expect(unwrapDataKey(master, wrapped, "user-2")).rejects.toThrow();
  });

  it("AAD 不符時解密失敗", async () => {
    const master = await importMasterKey(masterBase64);
    const ciphertext = await encryptString(master, "hello", "a");
    await expect(decryptString(master, ciphertext, "b")).rejects.toThrow();
  });

  it("sha256Hex", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
