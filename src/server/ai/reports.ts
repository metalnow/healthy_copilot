import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { healthDocuments, mediaObjects } from "@/db/schema";
import { toBase64 } from "@/lib/crypto";
import { AiError, NATIVE_PDF_PLUGIN, type ContentPart } from "@/lib/ai/openrouter";
import { labReportSystemPrompt } from "@/lib/ai/prompts";
import { LabExtractionSchema } from "@/lib/ai/schemas";
import { generateStructured } from "@/lib/ai/structured";
import { catalogForPrompt } from "@/lib/labs/catalog";
import type { JobMessage } from "@/jobs/types";
import { putMedia } from "@/server/media";
import { completeExtraction, createExtraction, failExtraction, isOverHourlyLimit } from "./extractions";
import { getModelProfile } from "./model-profiles";
import { openRouterConfig } from "./config";

type Env = Pick<CloudflareEnv, "MEDIA" | "AI_QUEUE" | "OPENROUTER_API_KEY" | "OPENROUTER_BASE_URL">;

export type ReportFile = { bytes: Uint8Array<ArrayBuffer>; mimeType: string; filename?: string };

/** 上傳報告：原始檔存 R2，建立文件與擷取紀錄，送進佇列背景處理 */
export async function createHealthReport(
  db: Db,
  env: Env,
  userId: string,
  input: { files: ReportFile[]; title?: string },
) {
  const config = openRouterConfig(env);
  if (!config.apiKey) throw new AiError("not_configured");
  if (await isOverHourlyLimit(db, userId)) throw new AiError("rate_limited");

  const mediaIds: string[] = [];
  for (const file of input.files) {
    mediaIds.push(await putMedia(db, env.MEDIA, userId, { kind: "health_report", ...file }));
  }
  const profile = await getModelProfile(db, "vision");
  const extractionId = await createExtraction(db, {
    userId,
    task: "report_vision",
    modelProfile: "vision",
    modelId: profile.modelId,
    inputMediaIds: mediaIds,
  });
  const isPdf = input.files[0].mimeType === "application/pdf";
  const [doc] = await db
    .insert(healthDocuments)
    .values({
      userId,
      mediaId: mediaIds[0],
      pageMediaIds: mediaIds,
      pageCount: isPdf ? null : mediaIds.length,
      title: input.title,
      status: "extracting",
      extractionId,
    })
    .returning({ id: healthDocuments.id });

  await env.AI_QUEUE.send({ kind: "report_extraction", userId, documentId: doc.id } satisfies JobMessage);
  return doc.id;
}

/** 暫時性錯誤交給佇列重試 */
const RETRYABLE: AiError["code"][] = ["timeout", "provider_error", "rate_limited"];
export const MAX_REPORT_ATTEMPTS = 3;

/**
 * 佇列 consumer：讀取 R2 原始檔，請 vision 模型擷取檢驗值。
 * 回傳 "retry" 時由佇列稍後重送；其他情況已更新文件狀態。
 */
export async function runReportExtraction(
  db: Db,
  env: Env,
  job: { userId: string; documentId: string },
  attempt: number,
): Promise<"done" | "retry"> {
  const [doc] = await db
    .select()
    .from(healthDocuments)
    .where(and(eq(healthDocuments.id, job.documentId), eq(healthDocuments.userId, job.userId)))
    .limit(1);
  if (!doc || doc.status !== "extracting" || !doc.extractionId) return "done";

  const started = Date.now();
  try {
    const ids = doc.pageMediaIds?.length ? doc.pageMediaIds : [doc.mediaId];
    const media = await db
      .select()
      .from(mediaObjects)
      .where(and(inArray(mediaObjects.id, ids), eq(mediaObjects.userId, job.userId)));

    const parts: ContentPart[] = [{ type: "text", text: "請擷取這份報告中的所有檢驗與量測結果。" }];
    let hasPdf = false;
    for (const id of ids) {
      const row = media.find((m) => m.id === id);
      const object = row && (await env.MEDIA.get(row.r2Key));
      if (!row || !object) throw new AiError("bad_request", "Report file missing");
      const base64 = toBase64(new Uint8Array(await object.arrayBuffer()));
      if (row.mimeType === "application/pdf") {
        hasPdf = true;
        parts.push({ type: "file", file: { filename: "report.pdf", file_data: `data:application/pdf;base64,${base64}` } });
      } else {
        parts.push({ type: "image_url", image_url: { url: `data:${row.mimeType};base64,${base64}` } });
      }
    }

    const profile = await getModelProfile(db, "vision");
    const response = await generateStructured(openRouterConfig(env), {
      model: profile.modelId,
      temperature: 0,
      maxTokens: 16000,
      system: labReportSystemPrompt(catalogForPrompt()),
      user: parts,
      schema: LabExtractionSchema,
      schemaName: "lab_report",
      plugins: hasPdf ? NATIVE_PDF_PLUGIN : undefined,
    });

    const confidences = response.data.items.map((i) => i.confidence);
    await completeExtraction(db, doc.extractionId, {
      parsedOutput: response.data,
      confidence: confidences.length ? Math.min(...confidences) : undefined,
      usage: {
        steps: [{ profile: "vision", modelId: response.model, ...response.usage }],
        totalCost: response.usage.cost ?? 0,
      },
      durationMs: Date.now() - started,
    });
    await db
      .update(healthDocuments)
      .set({
        status: "review",
        error: null,
        reportDate: doc.reportDate ?? response.data.reportDate,
        institution: doc.institution ?? response.data.institution,
      })
      .where(eq(healthDocuments.id, doc.id));
    return "done";
  } catch (error) {
    const code = error instanceof AiError ? error.code : "unexpected";
    if (error instanceof AiError && RETRYABLE.includes(error.code) && attempt < MAX_REPORT_ATTEMPTS) {
      return "retry";
    }
    await failExtraction(db, doc.extractionId, { error: code, durationMs: Date.now() - started });
    await db.update(healthDocuments).set({ status: "failed", error: code }).where(eq(healthDocuments.id, doc.id));
    return "done";
  }
}

/** 失敗的報告重新排入佇列 */
export async function retryHealthReport(db: Db, env: Env, userId: string, documentId: string) {
  const profile = await getModelProfile(db, "vision");
  const [doc] = await db
    .select()
    .from(healthDocuments)
    .where(and(eq(healthDocuments.id, documentId), eq(healthDocuments.userId, userId), eq(healthDocuments.status, "failed")))
    .limit(1);
  if (!doc) return false;
  const extractionId = await createExtraction(db, {
    userId,
    task: "report_vision",
    modelProfile: "vision",
    modelId: profile.modelId,
    inputMediaIds: doc.pageMediaIds ?? [doc.mediaId],
  });
  await db
    .update(healthDocuments)
    .set({ status: "extracting", error: null, extractionId })
    .where(eq(healthDocuments.id, doc.id));
  await env.AI_QUEUE.send({ kind: "report_extraction", userId, documentId } satisfies JobMessage);
  return true;
}
