"use client";

import { useActionState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { EXERCISE_TYPES, INTENSITIES } from "@/lib/enums";
import type { ActionState } from "@/lib/form";
import { EXERCISE_TYPE_LABELS, INTENSITY_LABELS } from "@/lib/labels";

export function ExerciseForm({
  action,
  defaultStartedAt,
  defaults,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaultStartedAt: string;
  /** 修改既有紀錄時的數值 */
  defaults?: {
    type: (typeof EXERCISE_TYPES)[number];
    durationMin: number;
    rpe?: number;
    intensity?: (typeof INTENSITIES)[number];
    afterMeal?: boolean;
    note?: string;
  };
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
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
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="afterMeal" defaultChecked={defaults?.afterMeal} className="size-4 accent-accent" />
        飯後運動（例如飯後散步）
      </label>
      <Field label="開始時間" htmlFor="startedAt" error={errors.startedAt}>
        <input id="startedAt" name="startedAt" type="datetime-local" defaultValue={defaultStartedAt} className={inputClass} />
      </Field>
      <Field label="備註（選填）" htmlFor="note">
        <input id="note" name="note" defaultValue={defaults?.note} maxLength={2000} className={inputClass} />
      </Field>
      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
