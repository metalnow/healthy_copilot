// 危險訊號規則引擎：固定門檻、固定文案，不經過 LLM，LLM 也不得覆蓋這裡的結果。
// 門檻為保守的提醒用途，不是診斷標準。

export type SafetyLevel = "emergency" | "urgent" | "caution";

export type SafetyAlert = {
  ruleId: string;
  level: SafetyLevel;
  title: string;
  message: string;
};

export const SAFETY_DISCLAIMER = "此提醒依固定規則產生，僅供參考，不是醫療診斷。";

const EMERGENCY_SYMPTOMS =
  "胸痛、呼吸困難、背痛、單側手腳麻木或無力、說話困難、視力改變或劇烈頭痛";

export function evaluateBloodPressure(bp: {
  systolic: number;
  diastolic: number;
}): SafetyAlert | null {
  if (bp.systolic >= 180 || bp.diastolic >= 120) {
    return {
      ruleId: "bp_severe_high",
      level: "urgent",
      title: "血壓非常高",
      message:
        `收縮壓 ≥ 180 或舒張壓 ≥ 120 mmHg。請靜坐休息 5 分鐘後再量一次。` +
        `若同時有${EMERGENCY_SYMPTOMS}，請立即撥打 119 或前往急診。` +
        `若沒有上述症狀但複測仍然偏高，請盡快聯絡醫師。`,
    };
  }
  if (bp.systolic >= 160 || bp.diastolic >= 100) {
    return {
      ruleId: "bp_high",
      level: "caution",
      title: "血壓明顯偏高",
      message:
        "收縮壓 ≥ 160 或舒張壓 ≥ 100 mmHg。請休息後複測；若持續偏高，建議近期回診與醫師討論。",
    };
  }
  if (bp.systolic < 90) {
    return {
      ruleId: "bp_low",
      level: "caution",
      title: "血壓偏低",
      message:
        "收縮壓 < 90 mmHg。若伴隨頭暈、眼前發黑或虛弱，請坐下或躺下休息並盡快就醫；" +
        "若昏倒或意識不清，請立即撥打 119。",
    };
  }
  return null;
}

export function evaluateHeartRate(bpm: number): SafetyAlert | null {
  if (bpm > 120 || bpm < 40) {
    return {
      ruleId: bpm > 120 ? "hr_high" : "hr_low",
      level: "caution",
      title: bpm > 120 ? "靜止心率過快" : "靜止心率過慢",
      message:
        `${bpm > 120 ? "心率 > 120" : "心率 < 40"} bpm。請休息後再量一次；` +
        "若伴隨胸悶、心悸、頭暈、昏厥或呼吸困難，請立即撥打 119 或前往急診。",
    };
  }
  return null;
}

/** 症狀 / 事件的危險訊號（依類型與嚴重度 1–5） */
export function evaluateSymptom(symptom: { type: string; severity: number }): SafetyAlert | null {
  const { type, severity } = symptom;
  switch (type) {
    case "chest_pain":
      return {
        ruleId: "symptom_chest_pain",
        level: "emergency",
        title: "胸痛",
        message:
          "胸痛可能是心臟或血管的急症。若胸口有壓迫感、疼痛超過數分鐘、延伸到手臂 / 下巴 / 背部，" +
          "或伴隨冒冷汗、呼吸困難、噁心、頭暈，請立即撥打 119，不要自行開車就醫。",
      };
    case "dyspnea":
      return {
        ruleId: "symptom_dyspnea",
        level: severity >= 3 ? "emergency" : "urgent",
        title: "呼吸困難",
        message:
          "休息時仍喘不過氣、說話困難、嘴唇發紫或伴隨胸痛時，請立即撥打 119。" +
          "症狀較輕但持續或反覆發生，請盡快就醫評估。",
      };
    case "syncope":
      return {
        ruleId: "symptom_syncope",
        level: "urgent",
        title: "暈厥 / 昏倒",
        message:
          "發生過昏倒請盡快就醫評估原因。若昏倒時受傷、伴隨胸痛、心悸、呼吸困難，或意識未完全恢復，請立即撥打 119。",
      };
    case "allergic_reaction":
    case "hives":
      if (type === "allergic_reaction" ? severity >= 3 : severity >= 4) {
        return {
          ruleId: "symptom_anaphylaxis_risk",
          level: "emergency",
          title: "可能是嚴重過敏反應",
          message:
            "若出現喉嚨緊縮、呼吸困難或喘鳴、嘴唇 / 舌頭 / 臉部腫脹、頭暈或快要昏倒，可能是過敏性休克：" +
            "有腎上腺素自動注射筆請立即使用，並撥打 119。",
        };
      }
      return null;
    case "palpitations":
      return severity >= 4
        ? {
            ruleId: "symptom_palpitations",
            level: "caution",
            title: "明顯心悸",
            message: "心悸若伴隨胸痛、呼吸困難、頭暈或昏倒，請立即撥打 119；持續或反覆發生請盡快就醫。",
          }
        : null;
    case "fever":
      return severity >= 4
        ? {
            ruleId: "symptom_high_fever",
            level: "caution",
            title: "高燒",
            message: "高燒不退、意識改變、頸部僵硬、呼吸急促或出現紫斑時，請盡快就醫或撥打 119。",
          }
        : null;
    default:
      return null;
  }
}
