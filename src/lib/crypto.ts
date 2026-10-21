// Envelope encryption（Web Crypto，Workers 與 Node 皆可用）
//
//   MASTER_ENCRYPTION_KEY（Worker secret）
//     └─ 包裝每位使用者的 DEK（存於 user_keys）
//          └─ 加密 OAuth token、備份檔等
//
// 密文格式："v1.<iv base64url>.<ciphertext base64url>"，AES-256-GCM。

const ALGO = "AES-GCM";
const IV_BYTES = 12;
const VERSION = "v1";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 標準 base64（OpenRouter 的圖片 data URL 與音訊需要） */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256Hex(input: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const data = typeof input === "string" ? encoder.encode(input) : input;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function importAesKey(raw: Uint8Array<ArrayBuffer>, extractable = false): Promise<CryptoKey> {
  if (raw.byteLength !== 32) {
    throw new Error("AES-256 key must be 32 bytes");
  }
  return crypto.subtle.importKey("raw", raw, ALGO, extractable, ["encrypt", "decrypt"]);
}

/** 匯入 MASTER_ENCRYPTION_KEY（標準 base64 或 base64url 皆可） */
export function importMasterKey(base64: string): Promise<CryptoKey> {
  return importAesKey(fromBase64Url(base64.trim()));
}

export async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  aad?: string,
): Promise<string> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv, additionalData: aad ? encoder.encode(aad) : undefined },
    key,
    plaintext,
  );
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptBytes(
  key: CryptoKey,
  payload: string,
  aad?: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const [version, iv, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !ciphertext) {
    throw new Error("Unsupported ciphertext format");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: ALGO, iv: fromBase64Url(iv), additionalData: aad ? encoder.encode(aad) : undefined },
    key,
    fromBase64Url(ciphertext),
  );
  return new Uint8Array(plaintext);
}

export async function encryptString(key: CryptoKey, plaintext: string, aad?: string) {
  return encryptBytes(key, encoder.encode(plaintext), aad);
}

export async function decryptString(key: CryptoKey, payload: string, aad?: string) {
  return decoder.decode(await decryptBytes(key, payload, aad));
}

/** 產生新的使用者 DEK，回傳以 master key 包裝後的字串（AAD 綁定 userId） */
export async function createWrappedDataKey(masterKey: CryptoKey, userId: string) {
  return encryptBytes(masterKey, randomBytes(32), `dek:${userId}`);
}

/** extractable 只在匯出使用者自行保管的復原金鑰時使用 */
export async function unwrapDataKey(masterKey: CryptoKey, wrapped: string, userId: string, extractable = false) {
  return importAesKey(await decryptBytes(masterKey, wrapped, `dek:${userId}`), extractable);
}
