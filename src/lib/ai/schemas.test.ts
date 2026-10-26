import { describe, expect, it } from "vitest";
import {
  FoodEstimateSchema,
  FoodPhotoResultSchema,
  LabExtractionSchema,
  StoredLabExtractionSchema,
  MedicationLabelSchema,
  ReviewOutputSchema,
  SleepScreenshotSchema,
  TextParseResultSchema,
  toResponseSchema,
} from "./schemas";

type JsonSchema = {
  type?: string | string[];
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
};

/** 依 Claude structured output 的計算方式：union 型別參數與非必填參數的數量 */
function complexity(schema: JsonSchema) {
  let unions = 0;
  let optional = 0;
  const walk = (node: JsonSchema) => {
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      if (child.anyOf || Array.isArray(child.type)) unions++;
      if (!node.required?.includes(key)) optional++;
      walk(child);
    }
    if (node.items) walk(node.items);
    node.anyOf?.forEach(walk);
  };
  walk(schema);
  return { unions, optional };
}

const AI_SCHEMAS = {
  TextParseResultSchema,
  FoodPhotoResultSchema,
  FoodEstimateSchema,
  MedicationLabelSchema,
  SleepScreenshotSchema,
  ReviewOutputSchema,
  LabExtractionSchema,
  StoredLabExtractionSchema,
};

describe("AI 輸出 schema 複雜度", () => {
  it.each(Object.entries(AI_SCHEMAS))("%s 不超過 Claude 的上限（16 個 union、24 個選填）", (_name, schema) => {
    const { unions, optional } = complexity(toResponseSchema(schema) as JsonSchema);
    expect(unions).toBeLessThanOrEqual(16);
    expect(optional).toBeLessThanOrEqual(24);
  });
});

describe("沒有值的表示方式", () => {
  it("none、空字串與 0 轉為 null", () => {
    const parsed = TextParseResultSchema.parse({
      unparsed: "",
      events: [
        {
          kind: "food",
          dayOffset: 0,
          localTime: "",
          confidence: 0.8,
          mealType: "none",
          satiety: 0,
          items: [{ name: "蛋", portion: "", confidence: 0.9, nutrition: { kcal: 80, proteinG: null, fatG: null, carbG: null, fiberG: null, sugarG: null, sodiumMg: null } }],
          drinkType: "none",
          drinkName: "",
          volumeMl: 0,
          caffeineMg: null,
          sugarG: null,
          alcoholG: null,
          drinkKcal: null,
          measurementType: "none",
          weightKg: 0,
          systolic: 0,
          diastolic: 0,
          pulse: 0,
          bpm: 0,
          waistCm: 0,
          exerciseType: "none",
          durationMin: 0,
          intensity: "none",
          afterMeal: false,
          symptomType: "none",
          severity: 0,
          note: "",
        },
      ],
    });
    const [event] = parsed.events;
    expect(parsed.unparsed).toBeNull();
    expect(event).toMatchObject({ localTime: null, mealType: null, satiety: null, drinkType: null, volumeMl: null, weightKg: null, severity: null, note: null });
    expect(event.items[0].portion).toBeNull();
  });
});

describe("StoredLabExtractionSchema", () => {
  it("可以讀回 transform 後存下的結果，舊資料沒有 followUps", () => {
    const output = LabExtractionSchema.parse({
      isHealthReport: true,
      reportDate: "2026-08-10",
      institution: null,
      items: [],
      followUps: [{ finding: "脂肪肝", action: "定期追蹤", department: "", intervalMonths: 0, page: 3 }],
      notes: null,
    });
    expect(output.followUps[0]).toMatchObject({ department: null, intervalMonths: null });
    expect(StoredLabExtractionSchema.safeParse(JSON.parse(JSON.stringify(output))).success).toBe(true);
    const old: Partial<typeof output> = { ...output };
    delete old.followUps;
    expect(StoredLabExtractionSchema.parse(old).followUps).toEqual([]);
  });
});
