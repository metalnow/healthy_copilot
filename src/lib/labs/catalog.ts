// 檢驗項目代碼表：把各醫院報告的名稱對應到統一代碼，並換算成標準單位，才能跨年度比較。

export const LAB_CATEGORIES = {
  body: "身體量測",
  blood: "血液常規",
  metabolic: "血糖代謝",
  lipid: "血脂",
  liver: "肝功能",
  kidney: "腎功能 / 尿酸 / 電解質",
  tumor: "腫瘤標記",
  infection: "肝炎 / 感染",
  immune: "過敏 / 免疫",
  imaging: "影像 / 其他評估",
  other: "其他",
} as const;
export type LabCategory = keyof typeof LAB_CATEGORIES;

type Conversion = (value: number) => number;

export type LabDefinition = {
  code: string;
  name: string;
  category: LabCategory;
  /** 標準單位；質性結果（陰性 / 陽性）為 null */
  unit: string | null;
  aliases: string[];
  /** 其他單位 → 標準單位（key 為正規化後的單位） */
  conversions?: Record<string, Conversion>;
  /** 是否可設定為數值型健康目標 */
  goal?: boolean;
  /** 同一代碼下有多個不同項目（例如各種過敏原、各部位超音波），依報告上的名稱分開保存與比較 */
  byName?: boolean;
};

const factor = (f: number): Conversion => (v) => v * f;

/** 血球計數的常見單位寫法（10³/µL = 10⁹/L = K/µL） */
const COUNT_10_3: Record<string, Conversion> = {
  "10^3/µl": factor(1),
  "10^3/ul": factor(1),
  "x10^3/µl": factor(1),
  "10^9/l": factor(1),
  "k/µl": factor(1),
  "k/ul": factor(1),
};
const COUNT_10_6: Record<string, Conversion> = {
  "10^6/µl": factor(1),
  "10^6/ul": factor(1),
  "x10^6/µl": factor(1),
  "10^12/l": factor(1),
  "m/µl": factor(1),
};

export const LAB_CATALOG: LabDefinition[] = [
  { code: "HEIGHT", name: "身高", category: "body", unit: "cm", aliases: ["身長", "height"], conversions: { m: factor(100) } },
  { code: "WEIGHT", name: "體重", category: "body", unit: "kg", aliases: ["weight", "bw"], goal: true },
  { code: "WAIST", name: "腰圍", category: "body", unit: "cm", aliases: ["waist"], conversions: { in: factor(2.54) }, goal: true },
  { code: "BMI", name: "BMI", category: "body", unit: "kg/m²", aliases: ["身體質量指數"], goal: true },
  { code: "SBP", name: "收縮壓", category: "body", unit: "mmHg", aliases: ["systolic", "血壓(收縮)"], goal: true },
  { code: "DBP", name: "舒張壓", category: "body", unit: "mmHg", aliases: ["diastolic", "血壓(舒張)"], goal: true },
  { code: "BODY_FAT", name: "體脂率", category: "body", unit: "%", aliases: ["體脂肪率", "body fat"], goal: true },
  { code: "VISCERAL_FAT", name: "內臟脂肪", category: "body", unit: "level", aliases: ["內臟脂肪等級", "內臟脂肪率", "visceral fat"], goal: true },
  { code: "PULSE", name: "脈搏", category: "body", unit: "bpm", aliases: ["pulse", "心跳", "次/min"], conversions: { "次/min": factor(1), "/min": factor(1) } },

  { code: "WBC", name: "白血球 WBC", category: "blood", unit: "10³/µL", aliases: ["wbc", "白血球總數"], conversions: COUNT_10_3 },
  { code: "RBC", name: "紅血球 RBC", category: "blood", unit: "10⁶/µL", aliases: ["rbc", "紅血球總數"], conversions: COUNT_10_6 },
  { code: "HB", name: "血色素 Hb", category: "blood", unit: "g/dL", aliases: ["hb", "hgb", "hemoglobin", "血紅素"], conversions: { "g/l": factor(0.1), "mmol/l": factor(1.611) } },
  { code: "HCT", name: "血球容積比 Hct", category: "blood", unit: "%", aliases: ["hct", "紅血球容積比", "hematocrit"] },
  { code: "MCV", name: "平均紅血球容積 MCV", category: "blood", unit: "fL", aliases: ["mcv", "平均血球容積"] },
  { code: "PLT", name: "血小板 PLT", category: "blood", unit: "10³/µL", aliases: ["plt", "platelet", "血小板數"], conversions: COUNT_10_3 },

  { code: "GLU_AC", name: "空腹血糖", category: "metabolic", unit: "mg/dL", aliases: ["飯前血糖", "glucose ac", "fasting glucose", "fbs", "ac sugar"], conversions: { "mmol/l": factor(18.016) }, goal: true },
  {
    code: "HBA1C",
    name: "糖化血色素 HbA1c",
    category: "metabolic",
    unit: "%",
    aliases: ["糖化血色素", "hba1c", "a1c", "glycated hemoglobin"],
    // IFCC (mmol/mol) → NGSP (%)
    conversions: { "mmol/mol": (v) => v * 0.0915 + 2.15 },
    goal: true,
  },

  { code: "TCHO", name: "總膽固醇", category: "lipid", unit: "mg/dL", aliases: ["total cholesterol", "t-cho", "chol", "膽固醇"], conversions: { "mmol/l": factor(38.67) }, goal: true },
  { code: "TG", name: "三酸甘油酯", category: "lipid", unit: "mg/dL", aliases: ["triglyceride", "tg", "中性脂肪"], conversions: { "mmol/l": factor(88.57) }, goal: true },
  { code: "HDL", name: "高密度膽固醇 HDL", category: "lipid", unit: "mg/dL", aliases: ["hdl-c", "hdl cholesterol", "高密度脂蛋白膽固醇"], conversions: { "mmol/l": factor(38.67) }, goal: true },
  { code: "LDL", name: "低密度膽固醇 LDL", category: "lipid", unit: "mg/dL", aliases: ["ldl-c", "ldl cholesterol", "低密度脂蛋白膽固醇"], conversions: { "mmol/l": factor(38.67) }, goal: true },

  { code: "AST", name: "GOT / AST", category: "liver", unit: "U/L", aliases: ["got", "sgot", "ast", "麩草酸轉胺酶"], conversions: { "iu/l": factor(1) }, goal: true },
  { code: "ALT", name: "GPT / ALT", category: "liver", unit: "U/L", aliases: ["gpt", "sgpt", "alt", "麩丙酮酸轉胺酶"], conversions: { "iu/l": factor(1) }, goal: true },
  { code: "ALP", name: "鹼性磷酸酶 ALP", category: "liver", unit: "U/L", aliases: ["alk-p", "alp", "alkaline phosphatase", "鹼性磷酸脢"], conversions: { "iu/l": factor(1) } },
  { code: "ALB", name: "白蛋白 Albumin", category: "liver", unit: "g/dL", aliases: ["albumin", "alb"], conversions: { "g/l": factor(0.1) } },
  { code: "TBIL", name: "總膽紅素", category: "liver", unit: "mg/dL", aliases: ["t-bili", "t-bil", "total bilirubin", "總膽紅素"], conversions: { "µmol/l": factor(1 / 17.1) } },
  { code: "GGT", name: "γ-GT", category: "liver", unit: "U/L", aliases: ["r-gt", "γ-gt", "gamma-gt", "ggt", "丙麩胺酸轉移酶"], conversions: { "iu/l": factor(1) }, goal: true },

  { code: "CREA", name: "肌酸酐 Creatinine", category: "kidney", unit: "mg/dL", aliases: ["creatinine", "cre", "肌酸酐"], conversions: { "µmol/l": factor(1 / 88.4) }, goal: true },
  { code: "EGFR", name: "腎絲球過濾率 eGFR", category: "kidney", unit: "mL/min/1.73m²", aliases: ["egfr", "腎絲球過濾率"], goal: true },
  { code: "BUN", name: "尿素氮 BUN", category: "kidney", unit: "mg/dL", aliases: ["bun", "尿素氮", "blood urea nitrogen"], conversions: { "mmol/l": factor(2.8) } },
  { code: "NA", name: "鈉 Na", category: "kidney", unit: "mmol/L", aliases: ["sodium", "na", "鈉"], conversions: { "meq/l": factor(1) } },
  { code: "K", name: "鉀 K", category: "kidney", unit: "mmol/L", aliases: ["potassium", "k", "鉀"], conversions: { "meq/l": factor(1) } },
  { code: "CA", name: "鈣 Ca", category: "kidney", unit: "mg/dL", aliases: ["calcium", "ca", "鈣"], conversions: { "mmol/l": factor(4.008) } },
  { code: "UA", name: "尿酸", category: "kidney", unit: "mg/dL", aliases: ["uric acid", "ua"], conversions: { "µmol/l": factor(1 / 59.48) }, goal: true },

  { code: "PSA", name: "攝護腺特異抗原 PSA", category: "tumor", unit: "ng/mL", aliases: ["psa", "攝護腺特異抗原"], conversions: { "µg/l": factor(1) } },
  { code: "AFP", name: "甲型胎兒蛋白 AFP", category: "tumor", unit: "ng/mL", aliases: ["afp", "α-fetoprotein", "甲型胎兒蛋白"], conversions: { "µg/l": factor(1) } },
  { code: "CEA", name: "癌胚抗原 CEA", category: "tumor", unit: "ng/mL", aliases: ["cea", "癌胚抗原"], conversions: { "µg/l": factor(1) } },

  { code: "HBSAG", name: "B 型肝炎表面抗原 HBsAg", category: "infection", unit: null, aliases: ["hbsag", "b肝表面抗原"] },
  { code: "ANTI_HBS", name: "B 型肝炎表面抗體 Anti-HBs", category: "infection", unit: "mIU/mL", aliases: ["anti-hbs", "b肝表面抗體"], conversions: { "iu/l": factor(1) } },
  { code: "ANTI_HBC", name: "B 型肝炎核心抗體 Anti-HBc", category: "infection", unit: null, aliases: ["anti-hbc"] },
  { code: "ANTI_HAV", name: "A 型肝炎抗體 Anti-HAV IgG", category: "infection", unit: null, aliases: ["hav-igg", "anti-hav", "a肝抗體"] },
  { code: "ANTI_HCV", name: "C 型肝炎抗體 Anti-HCV", category: "infection", unit: null, aliases: ["anti-hcv", "c肝抗體"] },

  { code: "IGE_TOTAL", name: "總 IgE", category: "immune", unit: "IU/mL", aliases: ["total ige", "ige", "免疫球蛋白e"], conversions: { "ku/l": factor(1) } },
  {
    code: "IGE_SPECIFIC",
    name: "過敏原特異性 IgE",
    category: "immune",
    unit: "kUA/L",
    aliases: ["specific ige", "過敏原", "rast", "mast", "allergen ige"],
    conversions: { "ku/l": factor(1), "kiu/l": factor(1), "iu/ml": factor(1) },
    byName: true,
  },
  { code: "ANA", name: "抗核抗體 ANA", category: "immune", unit: null, aliases: ["ana", "抗核抗體"] },

  { code: "CV_RISK", name: "心血管風險評估", category: "imaging", unit: null, aliases: ["心血管風險", "framingham", "10年心血管風險"] },
  { code: "LDH", name: "乳酸脫氫酶 LDH", category: "other", unit: "U/L", aliases: ["ldh", "乳酸脫氫脢"], conversions: { "iu/l": factor(1) } },
  { code: "CPK", name: "肌酸激酶 CPK", category: "other", unit: "U/L", aliases: ["cpk", "ck", "肌酸激脢"], conversions: { "iu/l": factor(1) } },
  { code: "BMD_T", name: "骨密度 T 值", category: "imaging", unit: null, aliases: ["骨質密度", "bone density", "t-score", "骨密度"] },
  { code: "ULTRASOUND", name: "超音波檢查", category: "imaging", unit: null, aliases: ["腹部超音波", "ultrasound", "超音波"], byName: true },

  { code: "OTHER", name: "其他項目", category: "other", unit: null, aliases: [], byName: true },
];

export const LAB_CODES = LAB_CATALOG.map((d) => d.code) as [string, ...string[]];

const BY_CODE = new Map(LAB_CATALOG.map((d) => [d.code, d]));

export function getLabDefinition(code: string): LabDefinition | undefined {
  return BY_CODE.get(code);
}

export function isGroupedByName(code: string) {
  return BY_CODE.get(code)?.byName ?? false;
}

/** 超音波部位：各院所寫法不同（「腹部超音波(ABD Ultrasound)」「腹部超音波檢查」），統一成部位名稱才能跨年度比較 */
const ULTRASOUND_SITES: [RegExp, string][] = [
  [/腹部|abd|abdom/i, "腹部超音波"],
  [/攝護腺|前列腺|prostat/i, "攝護腺超音波"],
  [/甲狀腺|thyroid/i, "甲狀腺超音波"],
  [/乳房|breast/i, "乳房超音波"],
  [/頸動脈|carotid/i, "頸動脈超音波"],
  [/心臟|cardiac|echocardio/i, "心臟超音波"],
  [/骨盆|子宮|卵巢|婦科|pelvi|uter|ovar/i, "骨盆腔超音波"],
  [/腎|膀胱|泌尿|renal|kidney|bladder/i, "腎臟 / 泌尿道超音波"],
  [/肝|膽|胰|脾|liver|gallbladder/i, "腹部超音波"],
];

/** 依名稱分組項目的統一名稱：超音波依部位；其他只整理空白 */
export function canonicalLabName(code: string, displayName: string): string {
  const name = displayName.replace(/\s+/g, " ").trim();
  if (code !== "ULTRASOUND") return name;
  return ULTRASOUND_SITES.find(([pattern]) => pattern.test(name))?.[1] ?? "超音波";
}

/** 名稱是超音波、但 AI 對到 OTHER 的項目 */
export function inferLabCode(code: string, displayName: string): string {
  return code === "OTHER" && /超音波|ultrasound|sonograph/i.test(displayName) ? "ULTRASOUND" : code;
}

/** 畫面上的項目名稱：依名稱分組的項目用報告原文，其他用代碼表名稱 */
export function labDisplayName(row: { code: string; displayName: string }) {
  return isGroupedByName(row.code)
    ? canonicalLabName(row.code, row.displayName)
    : (BY_CODE.get(row.code)?.name ?? row.displayName);
}

// ─── 過敏原特異性 IgE（RAST / ImmunoCAP 分級） ───────────────

/** ≥ 0.35 kUA/L 視為陽性 */
export const IGE_POSITIVE = 0.35;
const RAST_THRESHOLDS = [0.35, 0.7, 3.5, 17.5, 50, 100];
const RAST_LABELS = ["無過敏反應", "低程度", "中等程度", "中高程度", "高程度", "極高程度", "最高程度"];

/** kUA/L → 分級 0–6 */
export function rastClass(value: number): { level: number; label: string } {
  const level = RAST_THRESHOLDS.filter((t) => value >= t).length;
  return { level, label: RAST_LABELS[level] };
}

/** 單位字串正規化：大小寫、µ / u、空白、上標 */
export function normalizeUnitString(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^u(?=mol|g\/)/, "µ")
    .replace(/μ/g, "µ")
    .replace(/m2|m\^2/g, "m²")
    .replace(/^iu\/ml$/, "iu/ml");
}

/** 換算成代碼表的標準單位；無法換算時保留原值與原單位 */
export function toCanonicalUnit(
  code: string,
  value: number,
  unit: string | null | undefined,
): { value: number; unit: string | null; converted: boolean } {
  const def = BY_CODE.get(code);
  if (!def?.unit || !unit) return { value, unit: unit ?? def?.unit ?? null, converted: false };

  const normalized = normalizeUnitString(unit);
  if (normalized === normalizeUnitString(def.unit)) return { value, unit: def.unit, converted: false };

  const convert = def.conversions?.[normalized];
  if (!convert) return { value, unit, converted: false };
  return { value: Math.round(convert(value) * 100) / 100, unit: def.unit, converted: true };
}

/** 報告未標示且沒有逐項參考範圍時的預設判斷（目前只有過敏原 IgE 有固定的陽性門檻） */
export function defaultFlag(
  code: string,
  value: number | null,
  textValue: string | null,
): "high" | "normal" | null {
  if (code !== "IGE_SPECIFIC") return null;
  if (value !== null) return value >= IGE_POSITIVE ? "high" : "normal";
  if (textValue && /^\s*<\s*0?\.35/.test(textValue)) return "normal";
  return null;
}

/** 依參考範圍判斷高低（報告未標示時使用） */
export function flagFromReference(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): "low" | "high" | "normal" | "unknown" {
  if (value == null || (min == null && max == null)) return "unknown";
  if (min != null && value < min) return "low";
  if (max != null && value > max) return "high";
  return "normal";
}

/** 給 AI 的代碼清單 */
export function catalogForPrompt(): string {
  return LAB_CATALOG.filter((d) => d.code !== "OTHER")
    .map((d) => `${d.code}：${d.name}${d.unit ? `（${d.unit}）` : ""}${d.aliases.length ? `，又稱 ${d.aliases.join("、")}` : ""}`)
    .join("\n");
}
