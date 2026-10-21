"use client";

import { useActionState, useState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { DRINK_TYPES, type DrinkType } from "@/lib/enums";
import type { ActionState } from "@/lib/form";
import { DRINK_TYPE_LABELS } from "@/lib/labels";

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
};

export function DrinkForm({ action, defaultOccurredAt }: Props) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [drinkType, setDrinkType] = useState<DrinkType>("water");
  const [volume, setVolume] = useState("250");
  const [abv, setAbv] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

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
          <input id="name" name="name" maxLength={100} className={inputClass} />
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
