// 介面用的繁體中文標籤

import type {
  DRINK_TYPES,
  EXERCISE_TYPES,
  INTENSITIES,
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

export const SYMPTOM_LABELS: Record<string, string> = {
  hives: "蕁麻疹",
  dizziness: "頭暈",
  palpitations: "心悸",
  abdominal_pain: "腹痛",
  diarrhea: "腹瀉",
  headache: "頭痛",
  fatigue: "疲勞",
  allergic_reaction: "過敏反應",
  fever: "發燒",
  chest_pain: "胸痛",
  dyspnea: "呼吸困難",
  syncope: "暈厥 / 昏倒",
  alcohol: "飲酒",
  late_night: "熬夜",
  illness: "生病",
  stress_event: "壓力事件",
  other: "其他",
};

/** 症狀與生活事件分開顯示 */
export const LIFE_EVENT_TYPES = ["alcohol", "late_night", "illness", "stress_event"] as const;

export const SEVERITY_LABELS = ["", "很輕微", "輕微", "中等", "嚴重", "非常嚴重"] as const;

export const EXERCISE_TYPE_LABELS: Record<(typeof EXERCISE_TYPES)[number], string> = {
  walking: "走路",
  running: "跑步",
  cycling: "騎車",
  strength: "重訓",
  swimming: "游泳",
  hiking: "登山",
  other: "其他",
};

export const INTENSITY_LABELS: Record<(typeof INTENSITIES)[number], string> = {
  low: "輕鬆",
  moderate: "中等",
  high: "高強度",
};

export const SLEEP_QUALITY_LABELS = ["", "很差", "差", "普通", "好", "很好"] as const;
