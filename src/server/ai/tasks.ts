import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { userSettings, type AiUsage, type AiUsageStep } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { toBase64 } from "@/lib/crypto";
import {
  draftFromFoodPhoto,
  draftFromTextParse,
  type DraftEvent,
} from "@/lib/ai/draft";
import { AiError, transcribe, type OpenRouterConfig } from "@/lib/ai/openrouter";
import { FOOD_PHOTO_SYSTEM_PROMPT, SLEEP_SCREENSHOT_SYSTEM_PROMPT, textParseSystemPrompt } from "@/lib/ai/prompts";
import { FoodPhotoResultSchema, SleepScreenshotSchema, TextParseResultSchema } from "@/lib/ai/schemas";
import { generateStructured } from "@/lib/ai/structured";
import type { AI_TASKS } from "@/lib/enums";
import { WEEKDAY_LABELS } from "@/lib/labels";
import { resolveSleepTimes } from "@/lib/sleep";
import { toDateTimeLocalValue, toLocalDate, weekdayOfLocalDate } from "@/lib/time";
import { putMedia } from "@/server/media";
import { openRouterConfig } from "./config";
import {
  completeExtraction,
  createExtraction,
  failExtraction,
  isOverHourlyLimit,
} from "./extractions";
import { getModelProfile } from "./model-profiles";

export type SleepDraft = {
  sleepStartAt?: string;
  wakeAt?: string;
  totalSleepMin?: number;
  awakeMin?: number;
  deepMin?: number;
  remMin?: number;
  lightMin?: number;
  avgHeartRate?: number;
  hrvMs?: number;
};

export type AiTaskResult = {
  extractionId: string;
  task: (typeof AI_TASKS)[number];
  drafts: DraftEvent[];
  transcript?: string;
  notes?: string;
  unparsed?: string;
  /** 睡眠截圖的擷取結果（task = sleep_screenshot） */
  sleep?: SleepDraft;
  confidence?: number;
  mediaId?: string;
};

type Env = Pick<CloudflareEnv, "MEDIA" | "OPENROUTER_API_KEY" | "OPENROUTER_BASE_URL">;

async function shouldLogRawContent(db: Db, userId: string) {
  const [row] = await db
    .select({ value: userSettings.aiLogRawContent })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row?.value ?? false;
}

function totalCost(steps: AiUsageStep[]): AiUsage {
  return { steps, totalCost: steps.reduce((sum, s) => sum + (s.cost ?? 0), 0) };
}

/**
 * 共用流程：檢查額度 → 建立 pending 紀錄 → 執行 → 成功 / 失敗都記錄用量與耗時。
 * 失敗時只記錄錯誤代碼，不記錄健康內容。
 */
async function runTask(
  db: Db,
  env: Env,
  user: SessionUser,
  meta: { task: (typeof AI_TASKS)[number]; primaryProfile: Parameters<typeof getModelProfile>[1]; mediaIds?: string[] },
  run: (ctx: { config: OpenRouterConfig; steps: AiUsageStep[] }) => Promise<{
    result: Omit<AiTaskResult, "extractionId" | "task">;
    parsedOutput: unknown;
    rawOutput?: unknown;
    confidence?: number;
  }>,
): Promise<AiTaskResult> {
  const config = openRouterConfig(env);
  if (!config.apiKey) throw new AiError("not_configured");
  if (await isOverHourlyLimit(db, user.id)) throw new AiError("rate_limited");

  const primary = await getModelProfile(db, meta.primaryProfile);
  const extractionId = await createExtraction(db, {
    userId: user.id,
    task: meta.task,
    modelProfile: meta.primaryProfile,
    modelId: primary.modelId,
    inputMediaIds: meta.mediaIds,
  });

  const started = Date.now();
  const steps: AiUsageStep[] = [];
  try {
    const output = await run({ config, steps });
    await completeExtraction(db, extractionId, {
      parsedOutput: output.parsedOutput,
      rawOutput: (await shouldLogRawContent(db, user.id)) ? output.rawOutput : undefined,
      confidence: output.confidence,
      usage: totalCost(steps),
      durationMs: Date.now() - started,
    });
    return { extractionId, task: meta.task, ...output.result };
  } catch (error) {
    const code = error instanceof AiError ? error.code : "unexpected";
    await failExtraction(db, extractionId, {
      error: code,
      usage: totalCost(steps),
      durationMs: Date.now() - started,
    });
    throw error instanceof AiError ? error : new AiError("provider_error", String(error));
  }
}

export async function analyzeFoodPhoto(
  db: Db,
  env: Env,
  user: SessionUser,
  photo: { bytes: Uint8Array<ArrayBuffer>; mimeType: string; filename?: string },
): Promise<AiTaskResult> {
  const mediaId = await putMedia(db, env.MEDIA, user.id, { kind: "food_photo", ...photo });

  return runTask(db, env, user, { task: "food_vision", primaryProfile: "vision", mediaIds: [mediaId] }, async ({ config, steps }) => {
    const profile = await getModelProfile(db, "vision");
    const response = await generateStructured(config, {
      model: profile.modelId,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
      system: FOOD_PHOTO_SYSTEM_PROMPT,
      user: [
        { type: "text", text: "請辨識這張照片中的食物與飲料。" },
        { type: "image_url", image_url: { url: `data:${photo.mimeType};base64,${toBase64(photo.bytes)}` } },
      ],
      schema: FoodPhotoResultSchema,
      schemaName: "food_photo",
    });
    steps.push({ profile: "vision", modelId: response.model, ...response.usage });

    const now = new Date();
    return {
      result: {
        drafts: draftFromFoodPhoto(response.data, now, user.timezone),
        notes: response.data.isFood ? (response.data.notes ?? undefined) : "照片中看起來沒有食物或飲料。",
      },
      parsedOutput: { ...response.data, mediaId },
      rawOutput: response.raw,
      confidence: response.data.overallConfidence,
    };
  });
}

async function parseTextWithProfile(
  db: Db,
  config: OpenRouterConfig,
  user: SessionUser,
  text: string,
  steps: AiUsageStep[],
) {
  const profile = await getModelProfile(db, "fast");
  const now = new Date();
  const localDate = toLocalDate(now, user.timezone);
  const response = await generateStructured(config, {
    model: profile.modelId,
    temperature: profile.temperature,
    maxTokens: profile.maxTokens,
    system: textParseSystemPrompt({
      localDate,
      localTime: toDateTimeLocalValue(now, user.timezone).slice(11),
      weekday: WEEKDAY_LABELS[weekdayOfLocalDate(localDate)],
    }),
    user: text,
    schema: TextParseResultSchema,
    schemaName: "health_events",
  });
  steps.push({ profile: "fast", modelId: response.model, ...response.usage });
  const confidences = response.data.events.map((e) => e.confidence);
  return {
    data: response.data,
    raw: response.raw,
    drafts: draftFromTextParse(response.data, now, user.timezone),
    confidence: confidences.length > 0 ? Math.min(...confidences) : undefined,
  };
}

export async function parseHealthText(
  db: Db,
  env: Env,
  user: SessionUser,
  text: string,
): Promise<AiTaskResult> {
  return runTask(db, env, user, { task: "text_parse", primaryProfile: "fast" }, async ({ config, steps }) => {
    const parsed = await parseTextWithProfile(db, config, user, text, steps);
    return {
      result: { drafts: parsed.drafts, unparsed: parsed.data.unparsed ?? undefined },
      parsedOutput: { input: text, ...parsed.data },
      rawOutput: parsed.raw,
      confidence: parsed.confidence,
    };
  });
}

/** MediaRecorder 的 MIME type → OpenRouter 的音訊格式 */
export function audioFormatFor(mimeType: string): string | null {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  const formats: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
  };
  return formats[base] ?? null;
}

export async function transcribeAndParse(
  db: Db,
  env: Env,
  user: SessionUser,
  audio: { bytes: Uint8Array<ArrayBuffer>; mimeType: string; format: string },
): Promise<AiTaskResult> {
  const mediaId = await putMedia(db, env.MEDIA, user.id, {
    kind: "audio",
    bytes: audio.bytes,
    mimeType: audio.mimeType.split(";")[0],
  });

  return runTask(db, env, user, { task: "voice_input", primaryProfile: "asr", mediaIds: [mediaId] }, async ({ config, steps }) => {
    const asr = await getModelProfile(db, "asr");
    const transcription = await transcribe(config, {
      model: asr.modelId,
      audioBase64: toBase64(audio.bytes),
      format: audio.format,
      language: "zh",
    });
    steps.push({ profile: "asr", modelId: asr.modelId, ...transcription.usage });

    if (transcription.text === "") {
      return {
        result: { drafts: [], transcript: "", notes: "沒有聽到內容，請再錄一次。" },
        parsedOutput: { transcript: "", events: [], mediaId },
      };
    }

    const parsed = await parseTextWithProfile(db, config, user, transcription.text, steps);
    return {
      result: {
        drafts: parsed.drafts,
        transcript: transcription.text,
        unparsed: parsed.data.unparsed ?? undefined,
      },
      parsedOutput: { transcript: transcription.text, ...parsed.data, mediaId },
      rawOutput: parsed.raw,
      confidence: parsed.confidence,
    };
  });
}

const positive = (n: number | null) => (n !== null && n >= 0 ? Math.round(n) : undefined);

export async function analyzeSleepScreenshot(
  db: Db,
  env: Env,
  user: SessionUser,
  image: { bytes: Uint8Array<ArrayBuffer>; mimeType: string; filename?: string },
): Promise<AiTaskResult> {
  const mediaId = await putMedia(db, env.MEDIA, user.id, { kind: "sleep_screenshot", ...image });

  return runTask(db, env, user, { task: "sleep_screenshot", primaryProfile: "vision", mediaIds: [mediaId] }, async ({ config, steps }) => {
    const profile = await getModelProfile(db, "vision");
    const response = await generateStructured(config, {
      model: profile.modelId,
      temperature: 0,
      maxTokens: profile.maxTokens,
      system: SLEEP_SCREENSHOT_SYSTEM_PROMPT,
      user: [
        { type: "text", text: "請讀出這張截圖中的睡眠資料。" },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${toBase64(image.bytes)}` } },
      ],
      schema: SleepScreenshotSchema,
      schemaName: "sleep_screenshot",
    });
    steps.push({ profile: "vision", modelId: response.model, ...response.usage });

    const data = response.data;
    const times = data.isSleepData
      ? resolveSleepTimes({ wakeDate: data.wakeDate, sleepStart: data.sleepStart, sleepEnd: data.sleepEnd }, new Date(), user.timezone)
      : null;
    const toLocal = (d: Date | null | undefined) => (d ? toDateTimeLocalValue(d, user.timezone) : undefined);
    return {
      result: {
        drafts: [],
        mediaId,
        confidence: Math.min(1, Math.max(0, data.confidence)),
        notes: data.isSleepData ? (data.notes ?? undefined) : "截圖看起來不是睡眠紀錄。",
        sleep: data.isSleepData
          ? {
              sleepStartAt: toLocal(times?.sleepStartAt),
              wakeAt: toLocal(times?.wakeAt),
              totalSleepMin: positive(data.totalSleepMin),
              awakeMin: positive(data.awakeMin),
              deepMin: positive(data.deepMin),
              remMin: positive(data.remMin),
              lightMin: positive(data.lightMin),
              avgHeartRate: positive(data.avgHeartRate),
              hrvMs: positive(data.hrvMs),
            }
          : undefined,
      },
      parsedOutput: { ...data, mediaId },
      rawOutput: response.raw,
      confidence: data.confidence,
    };
  });
}
