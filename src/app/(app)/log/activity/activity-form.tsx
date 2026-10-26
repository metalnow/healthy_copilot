"use client";

import { useActionState, useState } from "react";
import { Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { LOW_CONFIDENCE } from "@/lib/ai/draft";
import type { ActionState } from "@/lib/form";
import type { AiTaskResult } from "@/server/ai/tasks";
import { resizeImage } from "../ai/image";

type Values = { localDate: string; steps: string; distanceKm: string; activeMinutes: string; totalKcal: string };

const str = (n: number | undefined) => (n === undefined ? "" : String(n));

export function ActivityForm({
  action,
  today,
  defaults,
  aiConfigured = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  today: string;
  /** 修改既有紀錄：日期固定，只改數值 */
  defaults?: { localDate: string; steps?: number; distanceKm?: number; activeMinutes?: number; totalKcal?: number };
  aiConfigured?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [values, setValues] = useState<Values>(() => ({
    localDate: defaults?.localDate ?? today,
    steps: str(defaults?.steps),
    distanceKm: str(defaults?.distanceKm),
    activeMinutes: str(defaults?.activeMinutes),
    totalKcal: str(defaults?.totalKcal),
  }));
  const [imported, setImported] = useState<{ extractionId: string; confidence?: number; notes?: string }>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();
  const set = (key: keyof Values, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const importScreenshot = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportError(undefined);
    try {
      const form = new FormData();
      form.set("screenshot", new File([await resizeImage(file, 2000, 0.9)], "activity.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/ai/activity-screenshot", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as (AiTaskResult & { error?: string }) | null;
      if (!response.ok || !json) throw new Error(json?.error ?? "截圖辨識失敗");
      const activity = json.activity;
      if (!activity) throw new Error(json.notes ?? "截圖中沒有找到步數資料");
      setValues({
        localDate: activity.localDate ?? today,
        steps: str(activity.steps),
        distanceKm: str(activity.distanceKm),
        activeMinutes: str(activity.activeMinutes),
        totalKcal: str(activity.totalKcal),
      });
      setImported({ extractionId: json.extractionId, confidence: json.confidence, notes: json.notes });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "截圖辨識失敗");
    } finally {
      setImporting(false);
    }
  };

  const numberInput = (key: keyof Values, label: string, props: React.ComponentProps<"input">) => (
    <Field label={label} htmlFor={key} error={errors[key]}>
      <input
        id={key}
        name={key}
        type="number"
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        className={inputClass}
        {...props}
      />
    </Field>
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error ?? importError} />

      {aiConfigured && !defaults && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-sm">
          {importing ? "AI 讀取截圖中…" : "📱 從手錶 / App 截圖匯入"}
          <input
            type="file"
            accept="image/*"
            disabled={importing}
            onChange={(e) => importScreenshot(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
      )}
      {imported && (
        <p className={`text-sm ${imported.confidence !== undefined && imported.confidence < LOW_CONFIDENCE ? "text-warning" : "text-muted"}`}>
          已從截圖帶入數值，請確認日期與數字。{imported.notes}
          {imported.confidence !== undefined && imported.confidence < LOW_CONFIDENCE && "（AI 信心較低）"}
        </p>
      )}
      <input type="hidden" name="extractionId" value={imported?.extractionId ?? ""} />

      {defaults ? (
        <p className="text-sm text-muted">
          日期：{defaults.localDate}
          <input type="hidden" name="localDate" value={defaults.localDate} />
        </p>
      ) : (
        <Field label="日期" htmlFor="localDate" error={errors.localDate} hint="同一天再次輸入會覆蓋原本的數值">
          <input
            id="localDate"
            name="localDate"
            type="date"
            value={values.localDate}
            onChange={(e) => set("localDate", e.target.value)}
            max={today}
            className={inputClass}
          />
        </Field>
      )}
      {numberInput("steps", "步數", { inputMode: "numeric", placeholder: "例如 8000" })}
      <div className="grid grid-cols-2 gap-3">
        {numberInput("distanceKm", "距離（公里，選填）", { step: "0.01", inputMode: "decimal" })}
        {numberInput("activeMinutes", "活動時間（分，選填）", { inputMode: "numeric" })}
      </div>
      <Field label="全日消耗熱量（kcal，選填）" htmlFor="totalKcal" error={errors.totalKcal} hint="手錶顯示的「能量」或總消耗，含基礎代謝；當天還沒結束時是到目前為止的數字">
        <input
          id="totalKcal"
          name="totalKcal"
          type="number"
          inputMode="numeric"
          value={values.totalKcal}
          onChange={(e) => set("totalKcal", e.target.value)}
          className={inputClass}
        />
      </Field>
      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
