"use client";

import { useActionState, useState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { LOW_CONFIDENCE } from "@/lib/ai/draft";
import { EXERCISE_TYPES, INTENSITIES } from "@/lib/enums";
import type { ActionState } from "@/lib/form";
import { EXERCISE_TYPE_LABELS, INTENSITY_LABELS } from "@/lib/labels";
import type { AiTaskResult } from "@/server/ai/tasks";
import { resizeImage } from "../ai/image";

type Defaults = {
  type: (typeof EXERCISE_TYPES)[number];
  durationMin?: number;
  rpe?: number;
  intensity?: (typeof INTENSITIES)[number];
  kcal?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  afterMeal?: boolean;
  note?: string;
};

export function ExerciseForm({
  action,
  defaultStartedAt,
  defaults: initial,
  aiConfigured = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaultStartedAt: string;
  /** 修改既有紀錄時的數值 */
  defaults?: Defaults;
  aiConfigured?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [defaults, setDefaults] = useState(initial);
  const [startedAt, setStartedAt] = useState(defaultStartedAt);
  const [imported, setImported] = useState<{ extractionId: string; confidence?: number; notes?: string }>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();

  const importScreenshot = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportError(undefined);
    try {
      const form = new FormData();
      form.set("screenshot", new File([await resizeImage(file, 2000, 0.9)], "exercise.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/ai/exercise-screenshot", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as (AiTaskResult & { error?: string }) | null;
      if (!response.ok || !json) throw new Error(json?.error ?? "截圖辨識失敗");
      const exercise = json.exercise;
      if (!exercise) throw new Error(json.notes ?? "截圖中沒有找到運動紀錄");
      const { startedAt: importedStart, ...rest } = exercise;
      setDefaults(rest);
      if (importedStart) setStartedAt(importedStart);
      setImported({ extractionId: json.extractionId, confidence: json.confidence, notes: json.notes });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "截圖辨識失敗");
    } finally {
      setImporting(false);
    }
  };
  const lowConfidence = imported?.confidence !== undefined && imported.confidence < LOW_CONFIDENCE;
  const hasWatchData = defaults?.kcal !== undefined || defaults?.avgHeartRate !== undefined || defaults?.maxHeartRate !== undefined;

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error ?? importError} />

      {aiConfigured && !initial && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-sm">
          {importing ? "AI 讀取截圖中…" : "📱 從手錶 / App 截圖匯入"}
          <input
            type="file"
            accept="image/*"
            disabled={importing}
            onChange={(e) => {
              importScreenshot(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="sr-only"
          />
        </label>
      )}
      {imported && (
        <p className={`text-sm ${lowConfidence ? "text-warning" : "text-muted"}`}>
          已從截圖帶入數值，請確認類型與時間。{imported.notes}
          {lowConfidence && "（AI 信心較低）"}
        </p>
      )}
      <input type="hidden" name="extractionId" value={imported?.extractionId ?? ""} />

      {/* 截圖帶入後以新的預設值重新建立欄位 */}
      <div key={imported?.extractionId ?? "initial"} className="space-y-4">
        <Field label="運動類型" error={errors.type}>
          <ChipGroup
            name="type"
            label="運動類型"
            defaultValue={defaults?.type ?? "walking"}
            options={EXERCISE_TYPES.map((t) => ({ value: t, label: EXERCISE_TYPE_LABELS[t] }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="時間（分鐘）" htmlFor="durationMin" error={errors.durationMin}>
            <input id="durationMin" name="durationMin" type="number" inputMode="numeric" placeholder="30" defaultValue={defaults?.durationMin} className={inputClass} />
          </Field>
          <Field label="費力程度 RPE（選填）" htmlFor="rpe" error={errors.rpe} hint="1 很輕鬆 – 10 極限">
            <input id="rpe" name="rpe" type="number" inputMode="numeric" min={1} max={10} defaultValue={defaults?.rpe} className={inputClass} />
          </Field>
        </div>
        <Field label="強度（選填）">
          <ChipGroup
            name="intensity"
            label="強度"
            defaultValue={defaults?.intensity}
            options={INTENSITIES.map((t) => ({ value: t, label: INTENSITY_LABELS[t] }))}
          />
        </Field>
        <details className="rounded-lg border border-border p-3" open={hasWatchData}>
          <summary className="cursor-pointer text-sm font-medium">消耗熱量與心率（選填）</summary>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Field label="熱量 kcal" htmlFor="kcal" error={errors.kcal}>
              <input id="kcal" name="kcal" type="number" inputMode="numeric" defaultValue={defaults?.kcal} className={inputClass} />
            </Field>
            <Field label="平均心率" htmlFor="avgHeartRate" error={errors.avgHeartRate}>
              <input id="avgHeartRate" name="avgHeartRate" type="number" inputMode="numeric" defaultValue={defaults?.avgHeartRate} className={inputClass} />
            </Field>
            <Field label="最大心率" htmlFor="maxHeartRate" error={errors.maxHeartRate}>
              <input id="maxHeartRate" name="maxHeartRate" type="number" inputMode="numeric" defaultValue={defaults?.maxHeartRate} className={inputClass} />
            </Field>
          </div>
        </details>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="afterMeal" defaultChecked={defaults?.afterMeal} className="size-4 accent-accent" />
          飯後運動（例如飯後散步）
        </label>
        <Field label="備註（選填）" htmlFor="note">
          <input id="note" name="note" defaultValue={defaults?.note} maxLength={2000} className={inputClass} />
        </Field>
      </div>
      <Field label="開始時間" htmlFor="startedAt" error={errors.startedAt}>
        <input
          id="startedAt"
          name="startedAt"
          type="datetime-local"
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
          className={inputClass}
        />
      </Field>
      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
