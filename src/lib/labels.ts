// 介面用的繁體中文標籤

import type {
  DRINK_TYPES,
  MEAL_TYPES,
  MEDICATION_CATEGORIES,
  MEDICATION_EVENT_STATUSES,
  MEDICATION_TIMINGS,
} from "@/lib/enums";
import type { ObservationType } from "@/lib/schemas/observation";

export const OBSERVATION_LABELS: Record<ObservationType, string> = {
  weight: "體重",
  blood_pressure: "血壓",
  heart_rate: "心率",
  waist: "腰圍",
};

export const MEAL_TYPE_LABELS: Record<(typeof MEAL_TYPES)[number], string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "點心",
  other: "其他",
};

export const DRINK_TYPE_LABELS: Record<(typeof DRINK_TYPES)[number], string> = {
  water: "水",
  coffee: "咖啡",
  tea: "茶",
  milk: "牛奶",
  sugary: "含糖飲料",
  alcohol: "酒精飲料",
  other: "其他",
};

export const MEDICATION_CATEGORY_LABELS: Record<(typeof MEDICATION_CATEGORIES)[number], string> = {
  prescription: "處方藥",
  otc: "成藥",
  supplement: "保健品 / 維他命",
};

export const MEDICATION_TIMING_LABELS: Record<(typeof MEDICATION_TIMINGS)[number], string> = {
  before_meal: "飯前",
  after_meal: "飯後",
  bedtime: "睡前",
  any: "不限",
};

export const MEDICATION_STATUS_LABELS: Record<(typeof MEDICATION_EVENT_STATUSES)[number], string> = {
  taken: "已服用",
  skipped: "略過",
  late: "延遲服用",
  unknown: "未知",
};

export const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;
