"use client";

import { useActionState, useState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { LOW_CONFIDENCE } from "@/lib/ai/draft";
import type { ActionState } from "@/lib/form";
import { SLEEP_QUALITY_LABELS } from "@/lib/labels";
import type { AiTaskResult, SleepDraft } from "@/server/ai/tasks";
import { resizeImage } from "../ai/image";

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: {
    bedtimeAt: string;
    wakeAt: string;
    /** 修改既有紀錄時的其他欄位 */
    sleepStartAt?: string;
    awakenings?: number;
    quality?: number;
    details?: SleepDraft;
  };
  aiConfigured: boolean;
};

const DETAIL_FIELDS: { key: keyof SleepDraft; label: string }[] = [
  { key: "totalSleepMin", label: "總睡眠（分）" },
  { key: "awakeMin", label: "清醒（分）" },
  { key: "deepMin", label: "深睡（分）" },
  { key: "remMin", label: "REM（分）" },
  { key: "lightMin", label: "淺睡（分）" },
  { key: "avgHeartRate", label: "平均心率" },
  { key: "hrvMs", label: "HRV（ms）" },
];

export function SleepForm({ action, defaults, aiConfigured }: Props) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [values, setValues] = useState<Record<string, string>>(() => ({
    bedtimeAt: defaults.bedtimeAt,
    sleepStartAt: defaults.sleepStartAt ?? "",
    wakeAt: defaults.wakeAt,
    ...Object.fromEntries(
      Object.entries(defaults.details ?? {}).flatMap(([k, v]) => (v !== undefined ? [[k, String(v)]] : [])),
    ),
  }));
  const hasDetails = Object.values(defaults.details ?? {}).some((v) => v !== undefined);
  const [imported, setImported] = useState<{ extractionId: string; confidence?: number; notes?: string }>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const importScreenshot = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportError(undefined);
    try {
      const form = new FormData();
      form.set("screenshot", new File([await resizeImage(file, 2000, 0.9)], "sleep.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/ai/sleep-screenshot", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as (AiTaskResult & { error?: string }) | null;
      if (!response.ok || !json) throw new Error(json?.error ?? "截圖辨識失敗");
      if (!json.sleep) throw new Error(json.notes ?? "截圖中沒有找到睡眠資料");
      const next: Record<string, string> = { ...values, bedtimeAt: "" };
      for (const [key, value] of Object.entries(json.sleep)) {
        if (value !== undefined) next[key] = String(value);
      }
      setValues(next);
      setImported({ extractionId: json.extractionId, confidence: json.confidence, notes: json.notes });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "截圖辨識失敗");
    } finally {
      setImporting(false);
    }
  };

  const timeInput = (key: string, label: string, hint?: string) => (
    <Field label={label} htmlFor={key} error={errors[key]} hint={hint}>
      <input
        id={key}
        name={key}
        type="datetime-local"
        value={values[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        className={inputClass}
      />
    </Field>
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error ?? importError} />

      {aiConfigured && (
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
          已從截圖帶入數值，請確認。{imported.notes}
          {imported.confidence !== undefined && imported.confidence < LOW_CONFIDENCE && "（AI 信心較低）"}
        </p>
      )}
      <input type="hidden" name="extractionId" value={imported?.extractionId ?? ""} />

      {timeInput("bedtimeAt", "上床時間")}
      {timeInput("sleepStartAt", "推估入睡時間（選填）")}
      {timeInput("wakeAt", "起床時間")}

      <div className="grid grid-cols-2 gap-3">
        <Field label="夜間醒來次數" htmlFor="awakenings" error={errors.awakenings}>
          <input id="awakenings" name="awakenings" type="number" inputMode="numeric" min={0} defaultValue={defaults.awakenings} className={inputClass} />
        </Field>
      </div>

      <Field label="主觀睡眠品質" error={errors.quality}>
        <ChipGroup
          name="quality"
          label="睡眠品質"
          defaultValue={defaults.quality !== undefined ? String(defaults.quality) : undefined}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} ${SLEEP_QUALITY_LABELS[n]}` }))}
        />
      </Field>

      <details className="rounded-lg border border-border p-3" open={Boolean(imported) || hasDetails}>
        <summary className="cursor-pointer text-sm font-medium">睡眠階段與心率（選填）</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {DETAIL_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} htmlFor={field.key} error={errors[field.key]}>
              <input
                id={field.key}
                name={field.key}
                type="number"
                inputMode="numeric"
                value={values[field.key] ?? ""}
                onChange={(e) => set(field.key, e.target.value)}
                className={inputClass}
              />
            </Field>
          ))}
        </div>
      </details>

      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
