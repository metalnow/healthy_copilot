import { NextResponse, type NextRequest } from "next/server";
import { getDb, getEnv } from "@/db";
import { AiError } from "@/lib/ai/openrouter";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/dal";
import { createHealthReport } from "@/server/ai/reports";
import { isSameOrigin, jsonError } from "@/server/http";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 12;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return jsonError("不允許的來源", 403);
  const user = await getCurrentUser();
  if (!user) return jsonError("請先登入", 401);

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const title = String(form.get("title") ?? "").trim().slice(0, 100) || undefined;

  if (files.length === 0) return jsonError("請選擇報告檔案", 400);
  const pdfs = files.filter((f) => f.type === "application/pdf");
  if (pdfs.length > 0) {
    if (files.length > 1) return jsonError("PDF 一次只能上傳一份", 400);
    if (pdfs[0].size > MAX_PDF_BYTES) return jsonError("PDF 太大（上限 15 MB）", 413);
  } else {
    if (files.length > MAX_IMAGES) return jsonError(`圖片最多 ${MAX_IMAGES} 張`, 400);
    if (files.some((f) => !IMAGE_TYPES.has(f.type))) return jsonError("只支援 PDF、JPEG、PNG、WebP", 415);
    if (files.some((f) => f.size > MAX_IMAGE_BYTES)) return jsonError("單張圖片上限 5 MB", 413);
  }

  const db = await getDb();
  try {
    const documentId = await createHealthReport(db, await getEnv(), user.id, {
      title,
      files: await Promise.all(
        files.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()), mimeType: f.type, filename: f.name })),
      ),
    });
    await recordAudit(db, { userId: user.id, action: "health_document.create", entityId: documentId });
    return NextResponse.json({ documentId });
  } catch (error) {
    if (error instanceof AiError) return jsonError(error.userMessage, error.code === "rate_limited" ? 429 : 503);
    throw error;
  }
}
