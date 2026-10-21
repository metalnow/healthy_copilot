"use client";

import { useActionState, useState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { MEDICATION_CATEGORIES, MEDICATION_TIMINGS } from "@/lib/enums";
import type { ActionState } from "@/lib/form";
import {
  MEDICATION_CATEGORY_LABELS,
  MEDICATION_TIMING_LABELS,
  WEEKDAY_LABELS,
} from "@/lib/labels";

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
};

let nextKey = 1;

export function MedicationForm({ action, defaults }: Props) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [times, setTimes] = useState(() =>
    (defaults?.times.length ? defaults.times : ["08:00"]).map((value) => ({ key: nextKey++, value })),
  );
  const days = new Set(defaults?.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6]);

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />

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

      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
