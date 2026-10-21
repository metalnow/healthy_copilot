// 檢驗項目代碼表：把各醫院報告的名稱對應到統一代碼，並換算成標準單位，才能跨年度比較。

export const LAB_CATEGORIES = {
  body: "身體量測",
  metabolic: "血糖代謝",
  lipid: "血脂",
  liver: "肝功能",
  kidney: "腎功能 / 尿酸",
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
};

const factor = (f: number): Conversion => (v) => v * f;

export const LAB_CATALOG: LabDefinition[] = [
  { code: "HEIGHT", name: "身高", category: "body", unit: "cm", aliases: ["身長", "height"], conversions: { m: factor(100) } },
  { code: "WEIGHT", name: "體重", category: "body", unit: "kg", aliases: ["weight", "bw"], goal: true },
  { code: "WAIST", name: "腰圍", category: "body", unit: "cm", aliases: ["waist"], conversions: { in: factor(2.54) }, goal: true },
  { code: "BMI", name: "BMI", category: "body", unit: "kg/m²", aliases: ["身體質量指數"], goal: true },
  { code: "SBP", name: "收縮壓", category: "body", unit: "mmHg", aliases: ["systolic", "血壓(收縮)"], goal: true },
  { code: "DBP", name: "舒張壓", category: "body", unit: "mmHg", aliases: ["diastolic", "血壓(舒張)"], goal: true },
  { code: "BODY_FAT", name: "體脂率", category: "body", unit: "%", aliases: ["體脂肪率", "body fat"], goal: true },
  { code: "VISCERAL_FAT", name: "內臟脂肪", category: "body", unit: "level", aliases: ["內臟脂肪等級", "visceral fat"], goal: true },

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
  { code: "GGT", name: "γ-GT", category: "liver", unit: "U/L", aliases: ["r-gt", "γ-gt", "gamma-gt", "ggt", "丙麩胺酸轉移酶"], conversions: { "iu/l": factor(1) }, goal: true },

  { code: "CREA", name: "肌酸酐 Creatinine", category: "kidney", unit: "mg/dL", aliases: ["creatinine", "cre", "肌酸酐"], conversions: { "µmol/l": factor(1 / 88.4) }, goal: true },
  { code: "EGFR", name: "腎絲球過濾率 eGFR", category: "kidney", unit: "mL/min/1.73m²", aliases: ["egfr", "腎絲球過濾率"], goal: true },
  { code: "UA", name: "尿酸", category: "kidney", unit: "mg/dL", aliases: ["uric acid", "ua"], conversions: { "µmol/l": factor(1 / 59.48) }, goal: true },

  { code: "PSA", name: "攝護腺特異抗原 PSA", category: "tumor", unit: "ng/mL", aliases: ["psa", "攝護腺特異抗原"], conversions: { "µg/l": factor(1) } },
  { code: "AFP", name: "甲型胎兒蛋白 AFP", category: "tumor", unit: "ng/mL", aliases: ["afp", "α-fetoprotein", "甲型胎兒蛋白"], conversions: { "µg/l": factor(1) } },
  { code: "CEA", name: "癌胚抗原 CEA", category: "tumor", unit: "ng/mL", aliases: ["cea", "癌胚抗原"], conversions: { "µg/l": factor(1) } },

  { code: "HBSAG", name: "B 型肝炎表面抗原 HBsAg", category: "infection", unit: null, aliases: ["hbsag", "b肝表面抗原"] },
  { code: "ANTI_HBS", name: "B 型肝炎表面抗體 Anti-HBs", category: "infection", unit: "mIU/mL", aliases: ["anti-hbs", "b肝表面抗體"], conversions: { "iu/l": factor(1) } },
  { code: "ANTI_HBC", name: "B 型肝炎核心抗體 Anti-HBc", category: "infection", unit: null, aliases: ["anti-hbc"] },
  { code: "ANTI_HCV", name: "C 型肝炎抗體 Anti-HCV", category: "infection", unit: null, aliases: ["anti-hcv", "c肝抗體"] },

  { code: "IGE_TOTAL", name: "總 IgE", category: "immune", unit: "IU/mL", aliases: ["total ige", "ige", "免疫球蛋白e"], conversions: { "ku/l": factor(1) } },
  { code: "IGE_SPECIFIC", name: "過敏原特異性 IgE", category: "immune", unit: null, aliases: ["specific ige", "過敏原"] },
  { code: "ANA", name: "抗核抗體 ANA", category: "immune", unit: null, aliases: ["ana", "抗核抗體"] },

  { code: "CV_RISK", name: "心血管風險評估", category: "imaging", unit: null, aliases: ["心血管風險", "framingham", "10年心血管風險"] },
  { code: "ULTRASOUND", name: "超音波檢查", category: "imaging", unit: null, aliases: ["腹部超音波", "ultrasound", "超音波"] },

  { code: "OTHER", name: "其他項目", category: "other", unit: null, aliases: [] },
];

export const LAB_CODES = LAB_CATALOG.map((d) => d.code) as [string, ...string[]];

const BY_CODE = new Map(LAB_CATALOG.map((d) => [d.code, d]));

export function getLabDefinition(code: string): LabDefinition | undefined {
  return BY_CODE.get(code);
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
