import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  ABNORMAL_FLAGS,
  AI_EXTRACTION_STATUSES,
  AI_TASKS,
  BACKUP_FREQUENCIES,
  DRINK_TYPES,
  EXERCISE_TYPES,
  GOAL_DIRECTIONS,
  GOAL_STATUSES,
  HEALTH_DOCUMENT_STATUSES,
  INPUT_TYPES,
  INTENSITIES,
  LAB_SOURCES,
  MEAL_TYPES,
  MEDIA_KINDS,
  MEDICATION_CATEGORIES,
  MEDICATION_EVENT_STATUSES,
  MEDICATION_TIMINGS,
  MODEL_PROFILE_KEYS,
  OBSERVATION_SOURCES,
  REVIEW_PERIODS,
} from "@/lib/enums";
import type { NutritionEstimate } from "@/lib/schemas/common";

export type AiUsageStep = {
  profile: string;
  modelId: string;
  promptTokens?: number;
  completionTokens?: number;
  audioSeconds?: number;
  cost?: number;
};
export type AiUsage = { steps: AiUsageStep[]; totalCost: number };

// 慣例：
// - 主鍵為 UUID 字串
// - 時間點以 ISO 8601 UTC 字串存放（*_at）
// - 事件另存 local_date（使用者當地日期）與 timezone，供每日 / 每週彙總，避免跨時區錯日
// - 建立 / 更新時間由應用程式寫入（timestamp_ms）

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const userId = () =>
  text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

/** 事件發生時間 + 當地日期 + 時區 */
const eventTime = (column = "occurred_at") => ({
  occurredAt: text(column).notNull(),
  localDate: text("local_date").notNull(),
  timezone: text("timezone").notNull(),
});

const bool = (name: string) => integer(name, { mode: "boolean" });

const jsonText = <T>(name: string) => text(name, { mode: "json" }).$type<T>();

// ─── 帳號與安全 ────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: id(),
  googleSubjectId: text("google_subject_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  timezone: text("timezone").notNull().default("Asia/Taipei"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 伺服器端 session；id 為 session token 的 SHA-256，資料庫不保存 token 原文 */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: userId(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** 每位使用者的資料加密金鑰（DEK），以 MASTER_ENCRYPTION_KEY 包裝後存放 */
export const userKeys = sqliteTable("user_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  wrappedKey: text("wrapped_key").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  createdAt: createdAt(),
});

/** Google Drive 等 OAuth token，一律以使用者 DEK 加密 */
export const oauthTokens = sqliteTable(
  "oauth_tokens",
  {
    id: id(),
    userId: userId(),
    provider: text("provider", { enum: ["google"] }).notNull(),
    purpose: text("purpose", { enum: ["drive"] }).notNull(),
    scope: text("scope").notNull(),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("oauth_tokens_user_purpose_uq").on(t.userId, t.provider, t.purpose)],
);

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  backupFrequency: text("backup_frequency", { enum: BACKUP_FREQUENCIES })
    .notNull()
    .default("weekly"),
  backupIncludeMedia: bool("backup_include_media").notNull().default(false),
  /** AI request log 是否保存原始健康內容（預設不保存） */
  aiLogRawContent: bool("ai_log_raw_content").notNull().default(false),
  updatedAt: updatedAt(),
});

/** 稽核紀錄：只記錄動作與對象，不記錄健康內容 */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonText<Record<string, unknown>>("metadata"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_user_idx").on(t.userId, t.createdAt)],
);

// ─── 檔案與 AI ─────────────────────────────────────────────

/** R2 物件的索引；原始檔案永不覆寫 */
export const mediaObjects = sqliteTable(
  "media_objects",
  {
    id: id(),
    userId: userId(),
    kind: text("kind", { enum: MEDIA_KINDS }).notNull(),
    r2Key: text("r2_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    originalFilename: text("original_filename"),
    createdAt: createdAt(),
  },
  (t) => [index("media_objects_user_idx").on(t.userId, t.kind)],
);

export const modelProfiles = sqliteTable("model_profiles", {
  key: text("key", { enum: MODEL_PROFILE_KEYS }).primaryKey(),
  provider: text("provider", { enum: ["openrouter"] }).notNull().default("openrouter"),
  modelId: text("model_id").notNull(),
  temperature: real("temperature"),
  maxTokens: integer("max_tokens"),
  updatedAt: updatedAt(),
});

/** AI 擷取的原始輸出；與使用者確認後的資料分開保存 */
export const aiExtractions = sqliteTable(
  "ai_extractions",
  {
    id: id(),
    userId: userId(),
    task: text("task", { enum: AI_TASKS }).notNull(),
    modelProfile: text("model_profile", { enum: MODEL_PROFILE_KEYS }).notNull(),
    modelId: text("model_id").notNull(),
    inputMediaIds: jsonText<string[]>("input_media_ids"),
    status: text("status", { enum: AI_EXTRACTION_STATUSES }).notNull().default("pending"),
    rawOutput: jsonText<unknown>("raw_output"),
    parsedOutput: jsonText<unknown>("parsed_output"),
    confidence: real("confidence"),
    error: text("error"),
    /** 每個模型呼叫的 token / 秒數與費用（OpenRouter credits） */
    usage: jsonText<AiUsage>("usage"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("ai_extractions_user_idx").on(t.userId, t.status),
    index("ai_extractions_user_created_idx").on(t.userId, t.createdAt),
  ],
);

// ─── Health Baseline ───────────────────────────────────────

export const healthProfiles = sqliteTable("health_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  sex: text("sex", { enum: ["male", "female", "other"] }),
  birthYear: integer("birth_year"),
  heightCm: real("height_cm"),
  allergies: jsonText<string[]>("allergies"),
  conditions: jsonText<string[]>("conditions"),
  note: text("note"),
  updatedAt: updatedAt(),
});

export const healthDocuments = sqliteTable(
  "health_documents",
  {
    id: id(),
    userId: userId(),
    mediaId: text("media_id")
      .notNull()
      .references(() => mediaObjects.id),
    title: text("title"),
    institution: text("institution"),
    reportDate: text("report_date"),
    pageCount: integer("page_count"),
    /** 多張圖片組成的報告：依頁序排列的 media id（第一頁同 media_id） */
    pageMediaIds: jsonText<string[]>("page_media_ids"),
    status: text("status", { enum: HEALTH_DOCUMENT_STATUSES }).notNull().default("uploaded"),
    extractionId: text("extraction_id").references(() => aiExtractions.id),
    /** 擷取失敗的錯誤代碼（不含健康內容） */
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("health_documents_user_idx").on(t.userId, t.reportDate)],
);

export const labObservations = sqliteTable(
  "lab_observations",
  {
    id: id(),
    userId: userId(),
    code: text("code").notNull(),
    displayName: text("display_name").notNull(),
    value: real("value"),
    textValue: text("text_value"),
    unit: text("unit"),
    measuredAt: text("measured_at").notNull(),
    referenceMin: real("reference_min"),
    referenceMax: real("reference_max"),
    referenceText: text("reference_text"),
    abnormalFlag: text("abnormal_flag", { enum: ABNORMAL_FLAGS }),
    sourceDocumentId: text("source_document_id").references(() => healthDocuments.id),
    sourcePage: integer("source_page"),
    source: text("source", { enum: LAB_SOURCES }).notNull(),
    confidence: real("confidence"),
    extractionId: text("extraction_id").references(() => aiExtractions.id),
    verifiedByUser: bool("verified_by_user").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("lab_observations_user_code_idx").on(t.userId, t.code, t.measuredAt)],
);

export const healthGoals = sqliteTable("health_goals", {
  id: id(),
  userId: userId(),
  metric: text("metric").notNull(),
  unit: text("unit"),
  baselineValue: real("baseline_value"),
  targetValue: real("target_value"),
  targetDate: text("target_date"),
  direction: text("direction", { enum: GOAL_DIRECTIONS }).notNull(),
  status: text("status", { enum: GOAL_STATUSES }).notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ─── 每日紀錄 ──────────────────────────────────────────────

/** 統一 Observation：體重、血壓、心率、腰圍…（values 依 type 而異） */
export const observations = sqliteTable(
  "observations",
  {
    id: id(),
    userId: userId(),
    type: text("type").notNull(),
    ...eventTime(),
    values: jsonText<Record<string, number | string>>("values").notNull(),
    unit: text("unit"),
    source: text("source", { enum: OBSERVATION_SOURCES }).notNull(),
    confidence: real("confidence"),
    note: text("note"),
    context: jsonText<Record<string, unknown>>("context"),
    mediaId: text("media_id").references(() => mediaObjects.id),
    extractionId: text("extraction_id").references(() => aiExtractions.id),
    /** 外部來源的 record id（Health Connect 等），用於去重 */
    externalId: text("external_id"),
    verifiedByUser: bool("verified_by_user").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("observations_user_type_idx").on(t.userId, t.type, t.occurredAt),
    index("observations_user_date_idx").on(t.userId, t.localDate),
  ],
);

export const foodEvents = sqliteTable(
  "food_events",
  {
    id: id(),
    userId: userId(),
    mealType: text("meal_type", { enum: MEAL_TYPES }).notNull(),
    ...eventTime(),
    inputType: text("input_type", { enum: INPUT_TYPES }).notNull(),
    totalNutrition: jsonText<NutritionEstimate>("total_nutrition"),
    aiConfidence: real("ai_confidence"),
    mediaId: text("media_id").references(() => mediaObjects.id),
    extractionId: text("extraction_id").references(() => aiExtractions.id),
    note: text("note"),
    verifiedByUser: bool("verified_by_user").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("food_events_user_date_idx").on(t.userId, t.localDate)],
);

export const foodItems = sqliteTable(
  "food_items",
  {
    id: id(),
    foodEventId: text("food_event_id")
      .notNull()
      .references(() => foodEvents.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    name: text("name").notNull(),
    quantity: real("quantity"),
    portion: text("portion"),
    cookingMethod: text("cooking_method"),
    hasSauce: bool("has_sauce"),
    nutrition: jsonText<NutritionEstimate>("nutrition"),
    confidence: real("confidence"),
  },
  (t) => [index("food_items_event_idx").on(t.foodEventId)],
);

export const drinkEvents = sqliteTable(
  "drink_events",
  {
    id: id(),
    userId: userId(),
    drinkType: text("drink_type", { enum: DRINK_TYPES }).notNull(),
    name: text("name"),
    ...eventTime(),
    inputType: text("input_type", { enum: INPUT_TYPES }).notNull(),
    volumeMl: real("volume_ml"),
    waterMl: real("water_ml"),
    caffeineMg: real("caffeine_mg"),
    sugarG: real("sugar_g"),
    alcoholG: real("alcohol_g"),
    nutrition: jsonText<NutritionEstimate>("nutrition"),
    confidence: real("confidence"),
    extractionId: text("extraction_id").references(() => aiExtractions.id),
    verifiedByUser: bool("verified_by_user").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("drink_events_user_date_idx").on(t.userId, t.localDate)],
);

export const medications = sqliteTable("medications", {
  id: id(),
  userId: userId(),
  name: text("name").notNull(),
  category: text("category", { enum: MEDICATION_CATEGORIES }).notNull(),
  dose: real("dose"),
  unit: text("unit"),
  timing: text("timing", { enum: MEDICATION_TIMINGS }),
  active: bool("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 每天固定時刻服用；days_of_week 為空代表每天 */
export const medicationSchedules = sqliteTable("medication_schedules", {
  id: id(),
  medicationId: text("medication_id")
    .notNull()
    .references(() => medications.id, { onDelete: "cascade" }),
  localTime: text("local_time").notNull(),
  daysOfWeek: jsonText<number[]>("days_of_week"),
  dose: real("dose"),
  startDate: text("start_date"),
  endDate: text("end_date"),
});

export const medicationEvents = sqliteTable(
  "medication_events",
  {
    id: id(),
    userId: userId(),
    medicationId: text("medication_id")
      .notNull()
      .references(() => medications.id, { onDelete: "cascade" }),
    scheduleId: text("schedule_id").references(() => medicationSchedules.id, {
      onDelete: "set null",
    }),
    scheduledAt: text("scheduled_at"),
    takenAt: text("taken_at"),
    localDate: text("local_date").notNull(),
    timezone: text("timezone").notNull(),
    status: text("status", { enum: MEDICATION_EVENT_STATUSES }).notNull(),
    actualDose: real("actual_dose"),
    createdAt: createdAt(),
  },
  (t) => [
    index("medication_events_user_date_idx").on(t.userId, t.localDate),
    uniqueIndex("medication_events_schedule_date_uq").on(t.scheduleId, t.localDate),
  ],
);

/** local_date 以起床日期為準 */
export const sleepSessions = sqliteTable(
  "sleep_sessions",
  {
    id: id(),
    userId: userId(),
    bedtimeAt: text("bedtime_at"),
    sleepStartAt: text("sleep_start_at"),
    wakeAt: text("wake_at").notNull(),
    localDate: text("local_date").notNull(),
    timezone: text("timezone").notNull(),
    awakenings: integer("awakenings"),
    quality: integer("quality"),
    totalSleepMin: integer("total_sleep_min"),
    awakeMin: integer("awake_min"),
    deepMin: integer("deep_min"),
    remMin: integer("rem_min"),
    lightMin: integer("light_min"),
    avgHeartRate: real("avg_heart_rate"),
    hrvMs: real("hrv_ms"),
    source: text("source", { enum: OBSERVATION_SOURCES }).notNull(),
    confidence: real("confidence"),
    originalImageId: text("original_image_id").references(() => mediaObjects.id),
    extractionId: text("extraction_id").references(() => aiExtractions.id),
    verifiedByUser: bool("verified_by_user").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sleep_sessions_user_date_idx").on(t.userId, t.localDate)],
);

export const activityDaily = sqliteTable(
  "activity_daily",
  {
    id: id(),
    userId: userId(),
    localDate: text("local_date").notNull(),
    steps: integer("steps"),
    distanceM: real("distance_m"),
    activeMinutes: integer("active_minutes"),
    activeKcal: real("active_kcal"),
    source: text("source", { enum: OBSERVATION_SOURCES }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("activity_daily_user_date_source_uq").on(t.userId, t.localDate, t.source)],
);

export const exerciseSessions = sqliteTable(
  "exercise_sessions",
  {
    id: id(),
    userId: userId(),
    type: text("type", { enum: EXERCISE_TYPES }).notNull(),
    ...eventTime("started_at"),
    durationMin: real("duration_min").notNull(),
    intensity: text("intensity", { enum: INTENSITIES }),
    rpe: integer("rpe"),
    afterMeal: bool("after_meal"),
    note: text("note"),
    source: text("source", { enum: OBSERVATION_SOURCES }).notNull().default("manual"),
    confidence: real("confidence"),
    extractionId: text("extraction_id").references(() => aiExtractions.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("exercise_sessions_user_date_idx").on(t.userId, t.localDate)],
);

export const symptomEvents = sqliteTable(
  "symptom_events",
  {
    id: id(),
    userId: userId(),
    type: text("type").notNull(),
    ...eventTime(),
    severity: integer("severity").notNull(),
    durationMin: integer("duration_min"),
    note: text("note"),
    relatedFoodEventIds: jsonText<string[]>("related_food_event_ids"),
    medicationEventIds: jsonText<string[]>("medication_event_ids"),
    source: text("source", { enum: OBSERVATION_SOURCES }).notNull().default("manual"),
    confidence: real("confidence"),
    extractionId: text("extraction_id").references(() => aiExtractions.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("symptom_events_user_date_idx").on(t.userId, t.localDate)],
);

// ─── 洞察 ──────────────────────────────────────────────────

export const aiReviews = sqliteTable(
  "ai_reviews",
  {
    id: id(),
    userId: userId(),
    period: text("period", { enum: REVIEW_PERIODS }).notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    modelId: text("model_id").notNull(),
    /** 伺服器先聚合的摘要（不含 raw event），即送給模型的輸入 */
    inputSummary: jsonText<unknown>("input_summary").notNull(),
    output: jsonText<unknown>("output"),
    status: text("status", { enum: ["pending", "succeeded", "failed"] })
      .notNull()
      .default("pending"),
    trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull().default("manual"),
    usage: jsonText<AiUsage>("usage"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("ai_reviews_user_period_uq").on(t.userId, t.period, t.periodStart)],
);

export const experiments = sqliteTable("experiments", {
  id: id(),
  userId: userId(),
  title: text("title").notNull(),
  hypothesis: text("hypothesis"),
  protocol: text("protocol").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  trackedMetrics: jsonText<string[]>("tracked_metrics"),
  status: text("status", { enum: ["planned", "running", "completed", "abandoned"] })
    .notNull()
    .default("planned"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const experimentEvents = sqliteTable(
  "experiment_events",
  {
    id: id(),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    adhered: bool("adhered").notNull(),
    note: text("note"),
  },
  (t) => [uniqueIndex("experiment_events_date_uq").on(t.experimentId, t.localDate)],
);

// ─── 整合與備份 ────────────────────────────────────────────

export const integrations = sqliteTable(
  "integrations",
  {
    id: id(),
    userId: userId(),
    provider: text("provider", { enum: ["health_connect", "apple_health"] }).notNull(),
    enabled: bool("enabled").notNull().default(false),
    settings: jsonText<Record<string, unknown>>("settings"),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("integrations_user_provider_uq").on(t.userId, t.provider)],
);

export const googleDriveBackups = sqliteTable(
  "google_drive_backups",
  {
    id: id(),
    userId: userId(),
    driveFileId: text("drive_file_id"),
    fileName: text("file_name").notNull(),
    formatVersion: integer("format_version").notNull(),
    includesMedia: bool("includes_media").notNull().default(false),
    recordCounts: jsonText<Record<string, number>>("record_counts"),
    sizeBytes: integer("size_bytes"),
    checksum: text("checksum"),
    trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull(),
    status: text("status", { enum: ["running", "succeeded", "failed"] })
      .notNull()
      .default("running"),
    error: text("error"),
    createdAt: createdAt(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("google_drive_backups_user_idx").on(t.userId, t.createdAt)],
);
