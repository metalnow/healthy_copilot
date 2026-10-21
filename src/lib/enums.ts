// 資料庫欄位與 Zod schema 共用的列舉值，兩邊必須一致。

export const OBSERVATION_SOURCES = [
  "manual",
  "smart_device",
  "screenshot",
  "health_connect",
  "apple_health",
  "ai_extract",
] as const;

export const LAB_SOURCES = ["hospital_report", "manual", "ai_extract"] as const;

export const ABNORMAL_FLAGS = ["low", "high", "critical", "normal", "unknown"] as const;

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "other"] as const;

export const INPUT_TYPES = ["photo", "text", "voice", "quick_item", "manual"] as const;

export const DRINK_TYPES = [
  "water",
  "coffee",
  "tea",
  "milk",
  "sugary",
  "alcohol",
  "other",
] as const;

export const MEDICATION_CATEGORIES = ["prescription", "otc", "supplement"] as const;

export const MEDICATION_TIMINGS = ["before_meal", "after_meal", "bedtime", "any"] as const;

export const MEDICATION_EVENT_STATUSES = ["taken", "skipped", "late", "unknown"] as const;

export const EXERCISE_TYPES = [
  "walking",
  "running",
  "cycling",
  "strength",
  "swimming",
  "hiking",
  "other",
] as const;

export const INTENSITIES = ["low", "moderate", "high"] as const;

export const GOAL_DIRECTIONS = ["increase", "decrease", "maintain"] as const;

export const GOAL_STATUSES = ["active", "achieved", "paused"] as const;

export const MEDIA_KINDS = ["health_report", "food_photo", "sleep_screenshot", "audio"] as const;

export const HEALTH_DOCUMENT_STATUSES = ["uploaded", "extracting", "review", "confirmed", "failed"] as const;

export const AI_TASKS = [
  "food_vision",
  "report_vision",
  "sleep_screenshot",
  "voice_input",
  "text_parse",
] as const;

export const AI_EXTRACTION_STATUSES = [
  "pending",
  "succeeded",
  "failed",
  "confirmed",
  "discarded",
] as const;

export const MODEL_PROFILE_KEYS = ["fast", "vision", "reasoning", "medical_summary", "asr"] as const;

export const REVIEW_PERIODS = ["weekly", "monthly", "quarterly"] as const;

export const BACKUP_FREQUENCIES = ["off", "daily", "weekly", "monthly"] as const;

export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];
export type MealType = (typeof MEAL_TYPES)[number];
export type DrinkType = (typeof DRINK_TYPES)[number];
export type ModelProfileKey = (typeof MODEL_PROFILE_KEYS)[number];
