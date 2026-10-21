import "server-only";
import type { Db } from "@/db/client";
import { mediaObjects } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import type { MEDIA_KINDS } from "@/lib/enums";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/** 原始檔案存 R2（永不覆寫），並在 D1 建立索引 */
export async function putMedia(
  db: Db,
  bucket: R2Bucket,
  userId: string,
  input: { kind: (typeof MEDIA_KINDS)[number]; bytes: Uint8Array<ArrayBuffer>; mimeType: string; filename?: string },
) {
  const id = crypto.randomUUID();
  const ext = EXTENSIONS[input.mimeType.split(";")[0]] ?? "bin";
  const key = `users/${userId}/${input.kind}/${new Date().toISOString().slice(0, 7)}/${id}.${ext}`;
  const sha256 = await sha256Hex(input.bytes);

  await bucket.put(key, input.bytes, {
    httpMetadata: { contentType: input.mimeType },
    sha256,
    onlyIf: { etagDoesNotMatch: "*" },
  });
  await db.insert(mediaObjects).values({
    id,
    userId,
    kind: input.kind,
    r2Key: key,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
    sha256,
    originalFilename: input.filename?.slice(0, 200),
  });
  return id;
}
