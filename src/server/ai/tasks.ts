import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { userSettings, type AiUsage, type AiUsageStep } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { toBase64 } from "@/lib/crypto";
import {
  draftFromFoodPhoto,
  draftFromTextParse,
  toNutrition,
  type DraftEvent,
} from "@/lib/ai/draft";
import { AiError, transcribe, type OpenRouterConfig } from "@/lib/ai/openrouter";
import {
  FOOD_ESTIMATE_SYSTEM_PROMPT,
  FOOD_PHOTO_SYSTEM_PROMPT,
  MEDICATION_LABEL_SYSTEM_PROMPT,
  ACTIVITY_SCREENSHOT_SYSTEM_PROMPT,
  EXERCISE_SCREENSHOT_SYSTEM_PROMPT,
  SLEEP_SCREENSHOT_SYSTEM_PROMPT,
  textParseSystemPrompt,
} from "@/lib/ai/prompts";
import {
  FoodEstimateSchema,
  FoodPhotoResultSchema,
  MedicationLabelSchema,
  ActivityScreenshotSchema,
  ExerciseScreenshotSchema,
  SleepScreenshotSchema,
  TextParseResultSchema,
} from "@/lib/ai/schemas";
import { generateStructured } from "@/lib/ai/structured";
import type { NutritionEstimate } from "@/lib/schemas/common";
import type { AI_TASKS, EXERCISE_TYPES, INTENSITIES } from "@/lib/enums";
import { WEEKDAY_LABELS } from "@/lib/labels";
import { medicationDraftFromLabel, type MedicationDraft } from "@/lib/medication/label";
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
import { foodPhotoPersonalization } from "./food-feedback";
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

export type ActivityDraft = {
  localDate?: string;
  steps?: number;
  distanceKm?: number;
  activeMinutes?: number;
  totalKcal?: number;
};

export type ExerciseDraft = {
  type: (typeof EXERCISE_TYPES)[number];
  /** datetime-local；截圖沒有時間時省略 */
  startedAt?: string;
  durationMin?: number;
  intensity?: (typeof INTENSITIES)[number];
  kcal?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  note?: string;
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
  /** 步數 / 活動量截圖的擷取結果（task = activity_screenshot） */
  activity?: ActivityDraft;
  /** 單次運動截圖的擷取結果（task = exercise_screenshot） */
  exercise?: ExerciseDraft;
  /** 藥品 / 保健品照片的擷取結果（task = medication_label） */
  medication?: MedicationDraft;
  /** 照片看不到容器下方時，想請使用者確認的問題（task = food_vision） */
  foodQuestion?: string;
  /** 手動輸入品項的營養估算，順序與送出的品項相同（task = food_estimate） */
  foodNutrition?: { nutrition?: NutritionEstimate; confidence: number }[];
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
  /** 使用者的補充說明或感受（選填） */
  note?: string,
): Promise<AiTaskResult> {
  const mediaId = await putMedia(db, env.MEDIA, user.id, { kind: "food_photo", ...photo });

  // 個人化：使用者寫的飲食習慣與過去的修正（不含身分資訊）
  const { context: personal } = await foodPhotoPersonalization(db, user.id);

  return runTask(db, env, user, { task: "food_vision", primaryProfile: "vision", mediaIds: [mediaId] }, async ({ config, steps }) => {
    const profile = await getModelProfile(db, "vision");
    const response = await generateStructured(config, {
      model: profile.modelId,
      maxTokens: profile.maxTokens,
      system: FOOD_PHOTO_SYSTEM_PROMPT,
      user: [
        { type: "text", text: "請辨識這張照片中的食物與飲料。" },
        { type: "image_url", image_url: { url: `data:${photo.mimeType};base64,${toBase64(photo.bytes)}` } },
        ...(note ? [{ type: "text" as const, text: `使用者補充說明：${note}` }] : []),
        ...(personal ? [{ type: "text" as const, text: personal }] : []),
      ],
      schema: FoodPhotoResultSchema,
      schemaName: "food_photo",
    });
    steps.push({ profile: "vision", modelId: response.model, ...response.usage });

    const now = new Date();
    return {
      result: {
        drafts: draftFromFoodPhoto(response.data, now, user.timezone),
        notes: response.data.isFood
          ? [response.data.notes, response.data.containerEstimate && `容器推估：${response.data.containerEstimate}`]
              .filter(Boolean)
              .join("\n") || undefined
          : "照片中看起來沒有食物或飲料。",
        foodQuestion: (response.data.isFood && response.data.hiddenQuestion) || undefined,
      },
      // 保留使用者的補充說明，之後比對修正時參考
      parsedOutput: { ...response.data, mediaId, userNote: note ?? null },
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

export async function analyzeActivityScreenshot(
  db: Db,
  env: Env,
  user: SessionUser,
  image: { bytes: Uint8Array<ArrayBuffer>; mimeType: string; filename?: string },
): Promise<AiTaskResult> {
  const mediaId = await putMedia(db, env.MEDIA, user.id, { kind: "activity_screenshot", ...image });

  return runTask(db, env, user, { task: "activity_screenshot", primaryProfile: "vision", mediaIds: [mediaId] }, async ({ config, steps }) => {
    const profile = await getModelProfile(db, "vision");
    const response = await generateStructured(config, {
      model: profile.modelId,
      maxTokens: profile.maxTokens,
      system: ACTIVITY_SCREENSHOT_SYSTEM_PROMPT,
      user: [
        { type: "text", text: "請讀出這張截圖中當天的步數與活動量。" },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${toBase64(image.bytes)}` } },
      ],
      schema: ActivityScreenshotSchema,
      schemaName: "activity_screenshot",
    });
    steps.push({ profile: "vision", modelId: response.model, ...response.usage });

    const data = response.data;
    const today = toLocalDate(new Date(), user.timezone);
    // 截圖日期不能是未來；讀不到日期時用今天
    const localDate = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && data.date <= today ? data.date : today;
    const round = (n: number | null, digits = 0) => (n === null ? undefined : Math.round(n * 10 ** digits) / 10 ** digits);
    return {
      result: {
        drafts: [],
        mediaId,
        confidence: Math.min(1, Math.max(0, data.confidence)),
        notes: data.isActivityData ? (data.notes ?? undefined) : "截圖看起來不是步數 / 活動量紀錄。",
        activity: data.isActivityData
          ? {
              localDate,
              steps: round(data.steps),
              distanceKm: round(data.distanceKm, 2),
              activeMinutes: round(data.activeMinutes),
              totalKcal: round(data.totalKcal),
            }
          : undefined,
      },
      parsedOutput: { ...data, mediaId },
      rawOutput: response.raw,
      confidence: data.confidence,
    };
  });
}

export async function analyzeExerciseScreenshot(
  db: Db,
  env: Env,
  user: SessionUser,
  image: { bytes: Uint8Array<ArrayBuffer>; mimeType: string; filename?: string },
): Promise<AiTaskResult> {
  const mediaId = await putMedia(db, env.MEDIA, user.id, { kind: "exercise_screenshot", ...image });

  return runTask(db, env, user, { task: "exercise_screenshot", primaryProfile: "vision", mediaIds: [mediaId] }, async ({ config, steps }) => {
    const profile = await getModelProfile(db, "vision");
    const response = await generateStructured(config, {
      model: profile.modelId,
      maxTokens: profile.maxTokens,
      system: EXERCISE_SCREENSHOT_SYSTEM_PROMPT,
      user: [
        { type: "text", text: "請讀出這張截圖中的運動紀錄。" },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${toBase64(image.bytes)}` } },
      ],
      schema: ExerciseScreenshotSchema,
      schemaName: "exercise_screenshot",
    });
    steps.push({ profile: "vision", modelId: response.model, ...response.usage });

    const data = response.data;
    const today = toLocalDate(new Date(), user.timezone);
    const date = data.startDate && /^\d{4}-\d{2}-\d{2}$/.test(data.startDate) && data.startDate <= today ? data.startDate : null;
    const time = data.startTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(data.startTime) ? data.startTime : null;
    const round = (n: number | null) => (n === null ? undefined : Math.round(n));
    return {
      result: {
        drafts: [],
        mediaId,
        confidence: Math.min(1, Math.max(0, data.confidence)),
        notes: data.isExerciseData ? (data.notes ?? undefined) : "截圖看起來不是運動紀錄。",
        exercise: data.isExerciseData
          ? {
              type: data.exerciseType,
              // 有時間沒日期時當作今天
              startedAt: time ? `${date ?? today}T${time}` : undefined,
              durationMin: data.durationSec ? Math.max(1, Math.round(data.durationSec / 60)) : undefined,
              intensity: data.intensity ?? undefined,
              kcal: round(data.kcal),
              avgHeartRate: round(data.avgHeartRate),
              maxHeartRate: round(data.maxHeartRate),
              note: data.title ?? undefined,
            }
          : undefined,
      },
      parsedOutput: { ...data, mediaId },
      rawOutput: response.raw,
      confidence: data.confidence,
    };
  });
}

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

export async function analyzeMedicationPhoto(
  db: Db,
  env: Env,
  user: SessionUser,
  image: { bytes: Uint8Array<ArrayBuffer>; mimeType: string; filename?: string },
): Promise<AiTaskResult> {
  const mediaId = await putMedia(db, env.MEDIA, user.id, { kind: "medication_photo", ...image });

  return runTask(db, env, user, { task: "medication_label", primaryProfile: "vision", mediaIds: [mediaId] }, async ({ config, steps }) => {
    const profile = await getModelProfile(db, "vision");
    const response = await generateStructured(config, {
      model: profile.modelId,
      maxTokens: profile.maxTokens,
      system: MEDICATION_LABEL_SYSTEM_PROMPT,
      user: [
        { type: "text", text: "請讀出這張照片中的藥品或保健品資訊。" },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${toBase64(image.bytes)}` } },
      ],
      schema: MedicationLabelSchema,
      schemaName: "medication_label",
    });
    steps.push({ profile: "vision", modelId: response.model, ...response.usage });

    const data = response.data;
    return {
      result: {
        drafts: [],
        mediaId,
        confidence: Math.min(1, Math.max(0, data.confidence)),
        notes: data.isMedication ? (data.notes ?? undefined) : "照片看起來不是藥品或保健品。",
        medication: data.isMedication ? medicationDraftFromLabel(data) : undefined,
      },
      parsedOutput: { ...data, mediaId },
      rawOutput: response.raw,
      confidence: data.confidence,
    };
  });
}

/** 手動輸入的品項 → 營養估算；只送品名與份量 */
export async function estimateFoodNutrition(
  db: Db,
  env: Env,
  user: SessionUser,
  items: { name: string; portion?: string }[],
): Promise<AiTaskResult> {
  return runTask(db, env, user, { task: "food_estimate", primaryProfile: "fast" }, async ({ config, steps }) => {
    const profile = await getModelProfile(db, "fast");
    const response = await generateStructured(config, {
      model: profile.modelId,
      maxTokens: profile.maxTokens,
      system: FOOD_ESTIMATE_SYSTEM_PROMPT,
      user: JSON.stringify(items.map((i) => ({ name: i.name, portion: i.portion ?? null }))),
      schema: FoodEstimateSchema,
      schemaName: "food_estimate",
    });
    steps.push({ profile: "fast", modelId: response.model, ...response.usage });
    if (response.data.items.length !== items.length) throw new AiError("invalid_output", "Item count mismatch");

    const foodNutrition = response.data.items.map((item) => ({
      nutrition: toNutrition(item),
      confidence: Math.min(1, Math.max(0, item.confidence)),
    }));
    return {
      result: { drafts: [], foodNutrition },
      parsedOutput: response.data,
      rawOutput: response.raw,
      confidence: Math.min(...foodNutrition.map((i) => i.confidence)),
    };
  });
}
