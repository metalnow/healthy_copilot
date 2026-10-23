"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { KcalInput } from "@/components/kcal-input";
import { DRINK_TYPES, type DrinkType } from "@/lib/enums";
import type { ActionState } from "@/lib/form";
import { DRINK_TYPE_LABELS } from "@/lib/labels";
import type { NutritionEstimate } from "@/lib/schemas/common";
import type { AiTaskResult } from "@/server/ai/tasks";

const VOLUME_PRESETS = [
  { label: "小杯 250", value: 250 },
  { label: "中杯 350", value: 350 },
  { label: "大杯 500", value: 500 },
  { label: "特大 700", value: 700 },
];

const ABV_PRESETS = [
  { label: "啤酒 5%", value: 5 },
  { label: "葡萄酒 12%", value: 12 },
  { label: "烈酒 40%", value: 40 },
];

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaultOccurredAt: string;
  /** 修改既有紀錄時的數值 */
  defaults?: { drinkType: DrinkType; name?: string; volumeMl?: number; abvPercent?: number; nutrition?: NutritionEstimate };
  aiConfigured?: boolean;
};

export function DrinkForm({ action, defaultOccurredAt, defaults, aiConfigured }: Props) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [drinkType, setDrinkType] = useState<DrinkType>(defaults?.drinkType ?? "water");
  const [name, setName] = useState(defaults?.name ?? "");
  const [volume, setVolume] = useState(String(defaults?.volumeMl ?? 250));
  const [abv, setAbv] = useState(defaults?.abvPercent !== undefined ? String(defaults.abvPercent) : "");
  // 熱量：可自行輸入或請 AI 依名稱與容量估算；沒改動時修改紀錄會依容量等比例調整原本的估算
  const [nutrition, setNutrition] = useState(defaults?.nutrition);
  const [nutritionChanged, setNutritionChanged] = useState(false);
  const [extractionId, setExtractionId] = useState<string>();
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string>();

  const changeNutrition = (next: NutritionEstimate | undefined) => {
    setNutrition(next);
    setNutritionChanged(true);
  };

  const estimate = async () => {
    setEstimating(true);
    setEstimateError(undefined);
    try {
      const label = name.trim() || DRINK_TYPE_LABELS[drinkType];
      const response = await fetch("/api/ai/food-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ name: label, portion: `${volume} ml` }] }),
      });
      const json = (await response.json().catch(() => null)) as (AiTaskResult & { error?: string }) | null;
      const estimated = json?.foodNutrition?.[0]?.nutrition;
      if (!response.ok || !estimated) throw new Error(json?.error ?? "熱量估算失敗");
      changeNutrition(estimated);
      setExtractionId(json.extractionId);
    } catch (e) {
      setEstimateError(e instanceof Error ? e.message : "熱量估算失敗");
    } finally {
      setEstimating(false);
    }
  };

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error ?? estimateError} />
      <input type="hidden" name="nutrition" value={nutrition ? JSON.stringify(nutrition) : ""} />
      <input type="hidden" name="nutritionChanged" value={nutritionChanged ? "1" : ""} />
      <input type="hidden" name="extractionId" value={extractionId ?? ""} />

      <Field label="類型" error={errors.drinkType}>
        <ChipGroup
          name="drinkType"
          label="類型"
          value={drinkType}
          onChange={setDrinkType}
          options={DRINK_TYPES.map((t) => ({ value: t, label: DRINK_TYPE_LABELS[t] }))}
        />
      </Field>

      {drinkType !== "water" && (
        <Field label="名稱（選填）" htmlFor="name" error={errors.name} hint="例如 無糖拿鐵、珍珠奶茶半糖">
          <input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className={inputClass}
          />
        </Field>
      )}

      <Field label="容量（ml）" htmlFor="volumeMl" error={errors.volumeMl}>
        <div className="mb-2 flex flex-wrap gap-2">
          {VOLUME_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setVolume(String(preset.value))}
              aria-pressed={volume === String(preset.value)}
              className="rounded-full border border-border px-3 py-1.5 text-sm aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-foreground"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <input
          id="volumeMl"
          name="volumeMl"
          type="number"
          inputMode="numeric"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          aria-invalid={errors.volumeMl ? true : undefined}
          className={inputClass}
        />
      </Field>

      {drinkType === "alcohol" && (
        <Field label="酒精濃度（%）" htmlFor="abvPercent" error={errors.abvPercent} hint="用來換算酒精克數">
          <div className="mb-2 flex flex-wrap gap-2">
            {ABV_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setAbv(String(preset.value))}
                aria-pressed={abv === String(preset.value)}
                className="rounded-full border border-border px-3 py-1.5 text-sm aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            id="abvPercent"
            name="abvPercent"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={abv}
            onChange={(e) => setAbv(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}

      {drinkType === "water" ? (
        <p className="text-sm text-muted">水沒有熱量。</p>
      ) : (
        <Field label="熱量（選填）" error={errors.nutrition}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <KcalInput nutrition={nutrition} onChange={changeNutrition} label="飲料熱量" />
            {aiConfigured && (
              <button
                type="button"
                onClick={estimate}
                disabled={estimating || !volume}
                className="flex items-center gap-1 rounded-full border border-accent/40 px-3 py-1.5 text-sm text-accent transition active:scale-95 disabled:opacity-60"
              >
                <Sparkles aria-hidden className="size-4" />
                {estimating ? "估算中…" : "AI 估算熱量"}
              </button>
            )}
          </div>
          {nutrition?.sugarG !== undefined && (
            <p className="mt-1 text-xs text-muted">糖 約 {Math.round(nutrition.sugarG)} g（估算）</p>
          )}
        </Field>
      )}

      <Field label="時間" htmlFor="occurredAt" error={errors.occurredAt}>
        <input
          id="occurredAt"
          name="occurredAt"
          type="datetime-local"
          defaultValue={defaultOccurredAt}
          className={inputClass}
        />
      </Field>

      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
