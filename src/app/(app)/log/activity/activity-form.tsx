"use client";

import { useActionState } from "react";
import { Field, FormError, inputClass, SubmitButton } from "@/components/form";
import type { ActionState } from "@/lib/form";

export function ActivityForm({
  action,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  today: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Field label="日期" htmlFor="localDate" error={errors.localDate} hint="同一天再次輸入會覆蓋原本的數值">
        <input id="localDate" name="localDate" type="date" defaultValue={today} max={today} className={inputClass} />
      </Field>
      <Field label="步數" htmlFor="steps" error={errors.steps}>
        <input id="steps" name="steps" type="number" inputMode="numeric" placeholder="例如 8000" autoFocus className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="距離（公里，選填）" htmlFor="distanceKm" error={errors.distanceKm}>
          <input id="distanceKm" name="distanceKm" type="number" step="0.1" inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="活動時間（分，選填）" htmlFor="activeMinutes" error={errors.activeMinutes}>
          <input id="activeMinutes" name="activeMinutes" type="number" inputMode="numeric" className={inputClass} />
        </Field>
      </div>
      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
