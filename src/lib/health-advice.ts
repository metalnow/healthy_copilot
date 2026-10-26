// 健檢後的改善行動：依檢驗項目與描述性發現（超音波等）給出飲食、生活與注意事項。
// 固定內容（一般衛教原則），不經 AI、不含用藥建議；個人情況仍以醫師判斷為準。

import type { NutrientKey } from "@/lib/nutrition";

export type AdviceSection = { label: string; items: string[] };

/** 拿近 7 天飲食紀錄比對的營養素與建議上下限 */
export type NutrientCheck = { key: NutrientKey; max?: number; min?: number; note: string };

export type Advice = {
  topic: string;
  /** 吃什麼、怎麼調整 */
  diet: string[];
  /** 運動、作息等生活習慣 */
  daily: string[];
  /** 要注意的狀況、何時就醫 */
  watch: string[];
  nutrients?: NutrientCheck[];
};

const SUGAR: NutrientCheck = { key: "sugarG", max: 50, note: "糖每日 50 g 以下（含飲料）" };
const SODIUM: NutrientCheck = { key: "sodiumMg", max: 2000, note: "鈉每日 2,000 mg 以下（約鹽 5 g）" };
const FIBER: NutrientCheck = { key: "fiberG", min: 25, note: "膳食纖維每日 25 g 以上" };
const ALCOHOL: NutrientCheck = { key: "alcoholG", max: 10, note: "酒精越少越好（每日 10 g 約一罐啤酒的 3/4）" };

const WEIGHT: Advice = {
  topic: "體重 / 腰圍",
  diet: [
    "每餐先吃蔬菜與蛋白質（豆魚蛋肉），最後吃澱粉；餐盤約一半是蔬菜。",
    "含糖飲料換成水或無糖茶；手搖飲改無糖或微糖、不加料。",
    "白飯、麵換成糙米、五穀或地瓜，一餐約一個拳頭大。",
    "外食選清蒸、滷、烤，少油炸、勾芡與加工肉品（香腸、培根）。",
  ],
  daily: [
    "每週累積 150 分鐘中等強度運動（快走、騎車、游泳），再加上 2 次肌力訓練。",
    "每天步數比現在多 2,000 步，例如提早一站下車、走樓梯。",
    "睡足 7 小時；睡眠不足會讓食慾變大。",
  ],
  watch: [
    "每週減 0.5–1 kg 為宜，減太快容易流失肌肉、復胖。",
    "固定在早上起床、如廁後量體重與腰圍，看趨勢而不是單日數字。",
  ],
  nutrients: [SUGAR],
};

const BLOOD_PRESSURE: Advice = {
  topic: "血壓",
  diet: [
    "減鹽：少喝湯汁、少沾醬，少吃泡麵、醃漬物、加工食品；買包裝食品看鈉含量。",
    "多吃蔬菜水果、低脂乳品、堅果（得舒飲食），補充鉀、鈣、鎂。",
    "減少酒精。",
  ],
  daily: [
    "規律有氧運動，每週至少 150 分鐘。",
    "體重過重時，每減 1 kg 收縮壓約可降 1 mmHg。",
    "戒菸，留意壓力與睡眠（打鼾、睡眠呼吸中止也會讓血壓升高）。",
  ],
  watch: [
    "居家量血壓用「722」原則：連續 7 天、早晚各 1 次、每次量 2 遍取平均。",
    "血壓 ≥ 180/120，或伴隨胸痛、劇烈頭痛、單側無力、說話不清，請立即就醫。",
  ],
  nutrients: [SODIUM],
};

const GLUCOSE: Advice = {
  topic: "血糖",
  diet: [
    "少吃甜食、含糖飲料與精緻澱粉（白麵包、蛋糕、白粥）。",
    "每餐澱粉份量固定，搭配蛋白質與蔬菜一起吃，血糖上升較慢。",
    "水果一次一個拳頭大，分開在兩餐之間吃，不要打成果汁。",
    "多吃全穀、豆類與蔬菜增加膳食纖維。",
  ],
  daily: ["飯後散步 10–15 分鐘。", "規律運動能改善胰島素敏感度；體重過重時減重 5–7%。"],
  watch: [
    "空腹血糖 ≥ 126 mg/dL 或 HbA1c ≥ 6.5% 已達糖尿病診斷標準，請到新陳代謝科確認。",
    "出現多喝、多尿、體重莫名下降時請就醫。",
  ],
  nutrients: [SUGAR, FIBER],
};

const TRIGLYCERIDE: Advice = {
  topic: "三酸甘油酯",
  diet: [
    "三酸甘油酯對糖與酒精最敏感：先戒含糖飲料、甜點，並減少飲酒。",
    "減少精緻澱粉與宵夜。",
    "每週吃 2 次魚（鯖魚、鮭魚、秋刀魚），少油炸。",
  ],
  daily: ["規律有氧運動。", "減重 5–10% 可明顯降低三酸甘油酯。"],
  watch: ["抽血前需空腹 8 小時以上，沒空腹數值會偏高。", "超過 500 mg/dL 有急性胰臟炎風險，請就醫。"],
  nutrients: [SUGAR, ALCOHOL],
};

const CHOLESTEROL: Advice = {
  topic: "膽固醇",
  diet: [
    "減少飽和脂肪：肥肉、豬皮、雞皮、奶油、椰子油、糕餅點心。",
    "避免反式脂肪：酥皮、奶精、人造奶油、部分油炸食品。",
    "燕麥、豆類、蔬果的水溶性纖維有助降低 LDL。",
    "用橄欖油、芥花油取代動物油；堅果一天一小把。",
  ],
  daily: ["規律運動、戒菸。"],
  watch: ["有糖尿病、高血壓或家族早發心血管疾病時，LDL 目標會更嚴格，請與醫師討論。"],
  nutrients: [FIBER],
};

const HDL: Advice = {
  topic: "好的膽固醇 HDL",
  diet: ["用好油取代壞油：橄欖油、堅果、深海魚。", "少吃精緻糖與精緻澱粉。"],
  daily: ["有氧運動是提升 HDL 最有效的方法。", "戒菸、減重也能提升 HDL。"],
  watch: [],
};

const URIC_ACID: Advice = {
  topic: "尿酸",
  diet: [
    "多喝水，每天 2,000 ml 以上（醫師有限制水分時除外）。",
    "少喝含糖飲料與果汁：果糖會讓尿酸上升。",
    "少喝酒，尤其是啤酒。",
    "減少內臟、海鮮、濃肉湯、火鍋湯。",
  ],
  daily: ["漸進減重，避免斷食或激烈節食（會讓尿酸暫時升高）。"],
  watch: ["關節（常見大腳趾）突然紅、腫、熱、痛，可能是痛風發作，請就醫。"],
  nutrients: [SUGAR, ALCOHOL],
};

const LIVER: Advice = {
  topic: "肝功能",
  diet: ["減少飲酒。", "少糖、少精緻澱粉、少油炸，這些是脂肪肝常見原因。"],
  daily: ["體重過重時減重 7–10%，可明顯改善脂肪肝與肝指數。", "規律運動。"],
  watch: [
    "不要自行服用來路不明的草藥、偏方或大量保健品，可能傷肝。",
    "B、C 型肝炎帶原者要定期追蹤肝功能與腹部超音波。",
  ],
  nutrients: [SUGAR, ALCOHOL],
};

const KIDNEY: Advice = {
  topic: "腎功能",
  diet: ["減鹽。", "蛋白質適量，不要大量補充高蛋白；控制血糖與血壓。"],
  daily: ["足量喝水，不憋尿。"],
  watch: ["不要自行長期服用止痛藥或來路不明的草藥。", "出現泡泡尿、水腫時請就醫，依醫師建議追蹤腎功能。"],
  nutrients: [SODIUM],
};

/** 檢驗代碼 → 改善行動 */
const METRIC_ADVICE: Record<string, Advice> = {
  WEIGHT,
  WAIST: WEIGHT,
  BMI: WEIGHT,
  BODY_FAT: WEIGHT,
  VISCERAL_FAT: WEIGHT,
  SBP: BLOOD_PRESSURE,
  DBP: BLOOD_PRESSURE,
  GLU_AC: GLUCOSE,
  HBA1C: GLUCOSE,
  TG: TRIGLYCERIDE,
  TCHO: CHOLESTEROL,
  LDL: CHOLESTEROL,
  HDL,
  UA: URIC_ACID,
  ALT: LIVER,
  AST: LIVER,
  GGT: LIVER,
  CREA: KIDNEY,
  EGFR: KIDNEY,
};

export function adviceForMetric(code: string): Advice | null {
  return METRIC_ADVICE[code] ?? null;
}

// ─── 描述性發現（超音波等） ───────────────────────────────

export type FindingAdvice = Advice & {
  /** 一般建議的追蹤方式（報告沒有寫時參考） */
  followUp: string;
};

const FINDINGS: { pattern: RegExp; advice: FindingAdvice }[] = [
  {
    pattern: /脂肪肝|fatty liver/i,
    advice: {
      ...LIVER,
      topic: "脂肪肝",
      followUp: "依報告建議定期追蹤肝功能與腹部超音波。",
    },
  },
  {
    pattern: /膽(囊)?結石|gallstone|cholelith/i,
    advice: {
      topic: "膽結石",
      diet: ["三餐定時，不要長時間空腹。", "避免一次吃大量油膩食物（油炸、肥肉、濃湯）。"],
      daily: ["維持體重，避免快速減重（會增加結石機會）。"],
      watch: ["右上腹持續疼痛、發燒、皮膚或眼白變黃時請盡快就醫。"],
      followUp: "依報告建議追蹤腹部超音波；有症狀請至肝膽腸胃科或一般外科。",
    },
  },
  {
    pattern: /膽囊息肉|息肉|polyp/i,
    advice: {
      topic: "息肉",
      diet: [],
      daily: [],
      watch: ["息肉通常沒有症狀，重點是定期追蹤大小變化；變大時請依醫師建議處理。"],
      followUp: "依報告建議定期複檢（膽囊息肉多為每 6–12 個月超音波追蹤）。",
    },
  },
  {
    pattern: /腎(臟)?結石|尿路結石|kidney stone|renal stone|nephrolith/i,
    advice: {
      topic: "腎結石",
      diet: [
        "多喝水，讓每天尿量約 2,000 ml 以上。",
        "減鹽、少喝含糖飲料；鈣質不需刻意避免，從食物攝取即可。",
        "少吃高草酸食物過量（菠菜、濃茶、堅果大量）。",
      ],
      daily: [],
      watch: ["腰側劇痛、血尿、發燒時請就醫。"],
      followUp: "依報告建議至泌尿科追蹤。",
      nutrients: [SODIUM, SUGAR],
    },
  },
  {
    pattern: /囊腫|cyst/i,
    advice: {
      topic: "囊腫",
      diet: [],
      daily: [],
      watch: ["單純性囊腫多為良性，通常只需定期觀察大小。"],
      followUp: "依報告建議定期超音波追蹤。",
    },
  },
  {
    pattern: /攝護腺肥大|前列腺肥大|prostat\w* (hypertrophy|enlarge)|bph/i,
    advice: {
      topic: "攝護腺肥大",
      diet: ["睡前 2 小時少喝水。", "減少咖啡因與酒精（會刺激膀胱、增加尿量）。"],
      daily: ["不要憋尿；久坐時起身活動。"],
      watch: ["解尿困難、尿不出來、血尿時請就醫。"],
      followUp: "依報告建議至泌尿科追蹤，並可搭配 PSA 檢驗。",
    },
  },
  {
    pattern: /結節|nodule/i,
    advice: {
      topic: "結節",
      diet: [],
      daily: [],
      watch: ["多數結節為良性，重點是追蹤大小與形態；摸到腫塊變大、聲音沙啞、吞嚥困難時請就醫。"],
      followUp: "依報告建議追蹤超音波，必要時由醫師安排進一步檢查。",
    },
  },
  {
    pattern: /骨質疏鬆|骨質缺乏|骨量減少|osteopor|osteopen/i,
    advice: {
      topic: "骨質密度",
      diet: [
        "每天鈣質約 1,000–1,200 mg：乳製品、豆腐、小魚乾、深綠色蔬菜。",
        "維生素 D：每天曬太陽 10–15 分鐘，或依醫師建議補充。",
      ],
      daily: ["負重與阻力運動（快走、爬樓梯、彈力帶）。", "居家防跌：照明、止滑、移除走道雜物。"],
      watch: ["戒菸、減少飲酒與過量咖啡。"],
      followUp: "依報告建議追蹤骨密度。",
    },
  },
  {
    pattern: /斑塊|狹窄|plaque|stenosis/i,
    advice: {
      ...CHOLESTEROL,
      topic: "血管斑塊",
      followUp: "依報告建議至心臟內科或神經內科追蹤。",
    },
  },
];

/** 報告建議寫的是檢驗項目（「三酸甘油酯偏高」）時，對應到檢驗項目的改善行動 */
const METRIC_KEYWORDS: { pattern: RegExp; advice: Advice; followUp: string }[] = [
  { pattern: /三酸甘油|中性脂肪|triglycerid|\bTG\b/i, advice: TRIGLYCERIDE, followUp: "依報告建議複檢血脂。" },
  { pattern: /膽固醇|血脂|LDL|cholesterol/i, advice: CHOLESTEROL, followUp: "依報告建議複檢血脂。" },
  { pattern: /血糖|糖化|HbA1c|glucose/i, advice: GLUCOSE, followUp: "依報告建議複檢血糖或至新陳代謝科。" },
  { pattern: /尿酸|uric/i, advice: URIC_ACID, followUp: "依報告建議複檢尿酸。" },
  { pattern: /血壓|hypertension/i, advice: BLOOD_PRESSURE, followUp: "居家量血壓並記錄，依報告建議回診。" },
  { pattern: /肝功能|肝指數|GOT|GPT|ALT|AST|γ-?GT|GGT/i, advice: LIVER, followUp: "依報告建議複檢肝功能。" },
  { pattern: /腎功能|肌酸酐|eGFR|creatinine/i, advice: KIDNEY, followUp: "依報告建議複檢腎功能。" },
  { pattern: /體重過重|肥胖|BMI|腰圍|體脂/i, advice: WEIGHT, followUp: "定期量體重與腰圍。" },
];

/** 移除「未見結石」「無脂肪肝」這類否定描述，避免誤判 */
function stripNegations(text: string) {
  return text.replace(/(未見|未發現|沒有|無明顯|無|no |without )[^，,。；;、\n]*/gi, "");
}

export function adviceForFinding(text: string): FindingAdvice[] {
  const cleaned = stripNegations(text);
  const findings = FINDINGS.filter((f) => f.pattern.test(cleaned)).map((f) => f.advice);
  const topics = new Set(findings.map((f) => f.topic));
  // 脂肪肝已含肝功能的建議，不重複列出
  if (topics.has("脂肪肝")) topics.add(LIVER.topic);
  const metrics = METRIC_KEYWORDS.filter((m) => m.pattern.test(cleaned) && !topics.has(m.advice.topic)).map((m) => {
    topics.add(m.advice.topic);
    return { ...m.advice, followUp: m.followUp };
  });
  return [...findings, ...metrics];
}

/** 描述性結果是否像是異常發現 */
const ABNORMAL_TEXT =
  /脂肪肝|息肉|結石|囊腫|結節|腫瘤|腫塊|鈣化|肥大|增厚|增大|擴張|狹窄|斑塊|血管瘤|病灶|陰影|異常|疑似|建議.*(追蹤|複檢|就診|門診)|fatty|polyp|stone|cyst|nodule|mass|lesion|abnormal/i;

export function looksAbnormal(text: string) {
  return ABNORMAL_TEXT.test(stripNegations(text));
}

/** 近期飲食與建議上下限比較：只回傳超過或不足的項目 */
export function checkNutrients(
  checks: NutrientCheck[],
  averages: Partial<Record<NutrientKey, number>>,
): (NutrientCheck & { value: number })[] {
  return checks.flatMap((check) => {
    const value = averages[check.key];
    if (value === undefined) return [];
    const over = check.max !== undefined && value > check.max;
    const under = check.min !== undefined && value < check.min;
    return over || under ? [{ ...check, value }] : [];
  });
}
