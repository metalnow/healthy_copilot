"use client";

import { Camera } from "lucide-react";
import { useActionState, useState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { applyMasks, ImageMasker, type MaskedPage } from "@/components/image-masker";
import { LOW_CONFIDENCE } from "@/lib/ai/draft";
import { MEDICATION_CATEGORIES, MEDICATION_TIMINGS } from "@/lib/enums";
import type { ActionState } from "@/lib/form";
import {
  MEDICATION_CATEGORY_LABELS,
  MEDICATION_TIMING_LABELS,
  WEEKDAY_LABELS,
} from "@/lib/labels";
import type { AiTaskResult } from "@/server/ai/tasks";
import { resizeImage } from "../log/ai/image";

export type MedicationFormDefaults = {
  name: string;
  category: (typeof MEDICATION_CATEGORIES)[number];
  dose: number | null;
  unit: string | null;
  timing: (typeof MEDICATION_TIMINGS)[number] | null;
  times: string[];
  daysOfWeek: number[] | null;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: MedicationFormDefaults;
  /** 顯示「拍照 / 從圖片新增」（只在新增時） */
  aiImport?: boolean;
};

let nextKey = 1;

const toTimeRows = (times: string[]) => (times.length ? times : ["08:00"]).map((value) => ({ key: nextKey++, value }));

export function MedicationForm({ action, defaults: initial, aiImport }: Props) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [defaults, setDefaults] = useState(initial);
  const [times, setTimes] = useState(() => toTimeRows(initial?.times ?? []));
  const days = new Set(defaults?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);

  const [imported, setImported] = useState<{ extractionId: string; confidence?: number; notes?: string }>();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();

  // 選好照片後先讓使用者塗黑藥袋上的姓名、病歷號，再送 AI
  const [photo, setPhoto] = useState<MaskedPage>();
  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setImportError(undefined);
    const resized = new File([await resizeImage(file, 2000, 0.9)], "medication.jpg", { type: "image/jpeg" });
    setPhoto({ file: resized, url: URL.createObjectURL(resized), masks: [] });
  };

  const importPhoto = async () => {
    if (!photo) return;
    setImporting(true);
    setImportError(undefined);
    try {
      const form = new FormData();
      form.set("photo", await applyMasks(photo.file, photo.masks));
      const response = await fetch("/api/ai/medication-photo", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as (AiTaskResult & { error?: string }) | null;
      if (!response.ok || !json) throw new Error(json?.error ?? "照片辨識失敗");
      const draft = json.medication;
      if (!draft) throw new Error(json.notes ?? "照片中沒有找到藥品或保健品資訊");
      setDefaults({
        name: draft.name ?? "",
        category: draft.category ?? "supplement",
        dose: draft.dose ?? null,
        unit: draft.unit ?? null,
        timing: draft.timing ?? null,
        times: draft.times,
        daysOfWeek: null,
      });
      setTimes(toTimeRows(draft.times));
      setImported({ extractionId: json.extractionId, confidence: json.confidence, notes: json.notes });
      setPhoto(undefined);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "照片辨識失敗");
    } finally {
      setImporting(false);
    }
  };
  const lowConfidence = imported?.confidence !== undefined && imported.confidence < LOW_CONFIDENCE;

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error ?? importError} />

      {aiImport && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-4 py-4 text-sm transition active:scale-[0.98] has-disabled:opacity-60">
          <Camera aria-hidden className="size-5 text-accent" />
          {photo ? "重新拍攝或選擇" : "拍照或選擇包裝、藥袋照片"}
          <input
            type="file"
            accept="image/*"
            disabled={importing}
            onChange={(e) => choosePhoto(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
      )}
      {photo && (
        <div className="space-y-3">
          <ImageMasker pages={[photo]} onChange={([page]) => setPhoto(page)} />
          <button
            type="button"
            onClick={importPhoto}
            disabled={importing}
            className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-accent-foreground transition active:scale-[0.98] disabled:opacity-60"
          >
            {importing ? "AI 讀取中…" : "AI 辨識"}
          </button>
        </div>
      )}
      {imported && (
        <p className={`text-sm ${lowConfidence ? "text-warning" : "text-muted"}`}>
          已從照片帶入，請確認後儲存。{imported.notes}
          {lowConfidence && "（AI 信心較低）"}
        </p>
      )}
      <input type="hidden" name="extractionId" value={imported?.extractionId ?? ""} />

      {/* 照片帶入後以新的預設值重新建立欄位 */}
      <div key={imported?.extractionId ?? "initial"} className="space-y-5">
        <Field label="名稱" htmlFor="name" error={errors.name}>
          <input
            id="name"
            name="name"
            defaultValue={defaults?.name}
            placeholder="例如 Vitamin D、魚油"
            maxLength={100}
            aria-invalid={errors.name ? true : undefined}
            className={inputClass}
          />
        </Field>

        <Field label="類別" error={errors.category}>
          <ChipGroup
            name="category"
            label="類別"
            defaultValue={defaults?.category ?? "supplement"}
            options={MEDICATION_CATEGORIES.map((c) => ({ value: c, label: MEDICATION_CATEGORY_LABELS[c] }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="每次劑量（選填）" htmlFor="dose" error={errors.dose}>
            <input
              id="dose"
              name="dose"
              type="number"
              inputMode="decimal"
              step="any"
              defaultValue={defaults?.dose ?? undefined}
              className={inputClass}
            />
          </Field>
          <Field label="單位" htmlFor="unit">
            <input
              id="unit"
              name="unit"
              defaultValue={defaults?.unit ?? undefined}
              placeholder="顆、mg、IU"
              maxLength={20}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="服用時機" error={errors.timing}>
          <ChipGroup
            name="timing"
            label="服用時機"
            defaultValue={defaults?.timing ?? "any"}
            options={MEDICATION_TIMINGS.map((t) => ({ value: t, label: MEDICATION_TIMING_LABELS[t] }))}
          />
        </Field>

        <div className="space-y-2">
          <span className="block text-sm font-medium">每天服用時間</span>
          <ul className="space-y-2">
            {times.map((time, index) => (
              <li key={time.key} className="flex gap-2">
                <input
                  name="localTime"
                  type="time"
                  value={time.value}
                  onChange={(e) =>
                    setTimes((current) =>
                      current.map((t) => (t.key === time.key ? { ...t, value: e.target.value } : t)),
                    )
                  }
                  aria-label={`第 ${index + 1} 個服用時間`}
                  className={inputClass}
                />
                {times.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setTimes((current) => current.filter((t) => t.key !== time.key))}
                    aria-label={`移除第 ${index + 1} 個服用時間`}
                    className="px-2 text-muted"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
          {times.length < 6 && (
            <button
              type="button"
              onClick={() => setTimes((current) => [...current, { key: nextKey++, value: "21:00" }])}
              className="text-sm text-accent"
            >
              ＋ 新增時間
            </button>
          )}
          {errors.localTime && (
            <p role="alert" className="text-sm text-warning">
              {errors.localTime}
            </p>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">星期</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, day) => (
              <label key={day} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="daysOfWeek"
                  value={day}
                  defaultChecked={days.has(day)}
                  className="peer sr-only"
                />
                <span className="block size-9 rounded-full border border-border text-center leading-9 text-sm peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
                  {label}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">全選或都不選代表每天</p>
        </fieldset>
      </div>

      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
