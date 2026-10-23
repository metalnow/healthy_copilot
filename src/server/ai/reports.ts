import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { healthDocuments, mediaObjects, users } from "@/db/schema";
import { toBase64 } from "@/lib/crypto";
import { AiError, NATIVE_PDF_PLUGIN, type ContentPart } from "@/lib/ai/openrouter";
import { labReportSystemPrompt } from "@/lib/ai/prompts";
import { LabExtractionSchema } from "@/lib/ai/schemas";
import { generateStructured } from "@/lib/ai/structured";
import { catalogForPrompt } from "@/lib/labs/catalog";
import { chunkPages, mergeLabExtractions } from "@/lib/labs/merge";
import { redactIdentity } from "@/lib/privacy/redact";
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
  /** text：文字型 PDF 在瀏覽器抽出、已移除身分資料的文字 */
  input: { files: ReportFile[]; title?: string; text?: string },
) {
  const config = openRouterConfig(env);
  if (!config.apiKey) throw new AiError("not_configured");
  if (await isOverHourlyLimit(db, userId)) throw new AiError("rate_limited");

  const mediaIds: string[] = [];
  for (const file of input.files) {
    mediaIds.push(await putMedia(db, env.MEDIA, userId, { kind: "health_report", ...file }));
  }
  const textMediaId = input.text
    ? await putMedia(db, env.MEDIA, userId, {
        kind: "health_report",
        bytes: new TextEncoder().encode(input.text) as Uint8Array<ArrayBuffer>,
        mimeType: "text/plain; charset=utf-8",
        filename: "report.txt",
      })
    : undefined;
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
      textMediaId,
      pageCount: isPdf ? null : mediaIds.length,
      title: input.title,
      status: "extracting",
      extractionId,
    })
    .returning({ id: healthDocuments.id });

  await env.AI_QUEUE.send({ kind: "report_extraction", userId, documentId: doc.id } satisfies JobMessage);
  return doc.id;
}

/** 每次送給模型的頁數，以及單次請求的逾時（報告輸出長，比一般 AI 請求寬鬆） */
const PAGES_PER_BATCH = 2;
const REPORT_TIMEOUT_MS = 180_000;

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
    // 文字型 PDF 只送文字（伺服器端再移除一次身分資料）；掃描檔與照片送圖片（使用者上傳前已塗黑身分欄位）
    const ids = doc.textMediaId ? [doc.textMediaId] : doc.pageMediaIds?.length ? doc.pageMediaIds : [doc.mediaId];
    const media = await db
      .select()
      .from(mediaObjects)
      .where(and(inArray(mediaObjects.id, ids), eq(mediaObjects.userId, job.userId)));

    // 每一頁一個 content part；舊流程直接上傳的 PDF 交給模型原生讀取，整份一次處理
    const pages: ContentPart[] = [];
    let pdf: ContentPart | null = null;
    const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, job.userId)).limit(1);
    for (const id of ids) {
      const row = media.find((m) => m.id === id);
      const object = row && (await env.MEDIA.get(row.r2Key));
      if (!row || !object) throw new AiError("bad_request", "Report file missing");
      if (row.mimeType.startsWith("text/plain")) {
        const { text } = redactIdentity(await object.text(), { names: [owner?.name] });
        for (const page of text.split(/\n(?=--- 第 \d+ 頁 ---)/)) {
          if (page.trim()) pages.push({ type: "text", text: page });
        }
        continue;
      }
      const base64 = toBase64(new Uint8Array(await object.arrayBuffer()));
      if (row.mimeType === "application/pdf") {
        pdf = { type: "file", file: { filename: "report.pdf", file_data: `data:application/pdf;base64,${base64}` } };
      } else {
        pages.push({ type: "image_url", image_url: { url: `data:${row.mimeType};base64,${base64}` } });
      }
    }

    // 多頁報告分批（每批 PAGES_PER_BATCH 頁）同時擷取再合併：避免單次輸出太長而逾時或被截斷
    const batches = pdf ? [[pdf]] : chunkPages(pages, PAGES_PER_BATCH);
    const isText = !pdf && pages[0]?.type === "text";
    const profile = await getModelProfile(db, "vision");
    const config = { ...openRouterConfig(env), timeoutMs: REPORT_TIMEOUT_MS };
    const responses = await Promise.all(
      batches.map((batch, i) => {
        const from = i * PAGES_PER_BATCH + 1;
        const range =
          batches.length === 1
            ? ""
            : `這是報告的第 ${from}–${from + batch.length - 1} 頁（共 ${pages.length} 頁），page 填報告上的實際頁碼。`;
        const intro = isText ? "以下是由 PDF 抽出的報告文字（身分資料已移除）。" : "";
        return generateStructured(config, {
          model: profile.modelId,
          maxTokens: 16000,
          system: labReportSystemPrompt(catalogForPrompt()),
          user: [{ type: "text", text: `請擷取這份報告中的所有檢驗與量測結果。${range}${intro}` }, ...batch],
          schema: LabExtractionSchema,
          schemaName: "lab_report",
          plugins: pdf ? NATIVE_PDF_PLUGIN : undefined,
        });
      }),
    );
    const response = {
      data: mergeLabExtractions(responses.map((r) => r.data)),
      steps: responses.map((r) => ({ profile: "vision" as const, modelId: r.model, ...r.usage })),
    };

    const confidences = response.data.items.map((i) => i.confidence);
    await completeExtraction(db, doc.extractionId, {
      parsedOutput: response.data,
      confidence: confidences.length ? Math.min(...confidences) : undefined,
      usage: { steps: response.steps, totalCost: response.steps.reduce((sum, st) => sum + (st.cost ?? 0), 0) },
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
    // 只記錄錯誤代碼，不記錄報告內容
    console.warn("report extraction failed", { code, attempt, name: error instanceof Error ? error.name : "unknown" });
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
