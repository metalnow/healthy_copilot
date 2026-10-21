import { describe, expect, it } from "vitest";
import { parseMeasurementForm } from "./measurement-form";

const now = new Date("2026-10-21T01:00:00Z"); // 台北 09:00

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("parseMeasurementForm", () => {
  it("體重", () => {
    const result = parseMeasurementForm(
      "weight",
      form({ weight: "85.2", occurredAt: "2026-10-21T07:30" }),
      "Asia/Taipei",
      now,
    );
    expect(result).toEqual({
      ok: true,
      data: {
        values: { weight: 85.2 },
        occurredAt: new Date("2026-10-20T23:30:00Z"),
        note: undefined,
        context: undefined,
      },
    });
  });

  it("沒有填時間時使用現在", () => {
    const result = parseMeasurementForm("heart_rate", form({ bpm: "72" }), "Asia/Taipei", now);
    expect(result.ok && result.data.occurredAt).toEqual(now);
  });

  it("血壓含情境，脈搏可省略", () => {
    const result = parseMeasurementForm(
      "blood_pressure",
      form({
        systolic: "128",
        diastolic: "82",
        position: "sitting",
        arm: "left",
        afterRestMinutes: "5",
        beforeBreakfast: "on",
      }),
      "Asia/Taipei",
      now,
    );
    expect(result.ok && result.data.values).toEqual({ systolic: 128, diastolic: 82 });
    expect(result.ok && result.data.context).toEqual({
      position: "sitting",
      arm: "left",
      afterRestMinutes: 5,
      beforeBreakfast: true,
    });
  });

  it("數值超出範圍或未填時回報欄位錯誤", () => {
    const result = parseMeasurementForm(
      "blood_pressure",
      form({ systolic: "abc", diastolic: "" }),
      "Asia/Taipei",
      now,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors).toEqual({
      systolic: "請輸入 50–300 之間的收縮壓",
      diastolic: "請輸入 30–200 之間的舒張壓",
    });
  });

  it("收縮壓必須大於舒張壓", () => {
    const result = parseMeasurementForm(
      "blood_pressure",
      form({ systolic: "80", diastolic: "90" }),
      "Asia/Taipei",
      now,
    );
    expect(!result.ok && Object.values(result.fieldErrors)).toContain("收縮壓必須大於舒張壓");
  });

  it("拒絕未來時間", () => {
    const result = parseMeasurementForm(
      "weight",
      form({ weight: "80", occurredAt: "2026-10-21T12:00" }),
      "Asia/Taipei",
      now,
    );
    expect(!result.ok && result.fieldErrors.occurredAt).toBe("時間不能晚於現在");
  });
});
