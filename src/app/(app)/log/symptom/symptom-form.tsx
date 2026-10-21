"use client";

import { useActionState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import type { ActionState } from "@/lib/form";
import { LIFE_EVENT_TYPES, SEVERITY_LABELS, SYMPTOM_LABELS } from "@/lib/labels";
import { SYMPTOM_TYPES } from "@/lib/schemas/symptom";

const LIFE_EVENTS = new Set<string>(LIFE_EVENT_TYPES);

export function SymptomForm({
  action,
  defaultOccurredAt,
  recentFood,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaultOccurredAt: string;
  recentFood: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Field label="症狀" error={errors.type}>
        <ChipGroup
          name="type"
          label="症狀"
          options={SYMPTOM_TYPES.filter((t) => !LIFE_EVENTS.has(t) && t !== "other").map((t) => ({
            value: t,
            label: SYMPTOM_LABELS[t],
          }))}
        />
      </Field>
      <Field label="或生活事件">
        <ChipGroup
          name="type"
          label="生活事件"
          options={[...LIFE_EVENT_TYPES, "other" as const].map((t) => ({ value: t, label: SYMPTOM_LABELS[t] }))}
        />
      </Field>
      <Field label="嚴重度" error={errors.severity}>
        <ChipGroup
          name="severity"
          label="嚴重度"
          defaultValue="2"
          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} ${SEVERITY_LABELS[n]}` }))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="發生時間" htmlFor="occurredAt" error={errors.occurredAt}>
          <input id="occurredAt" name="occurredAt" type="datetime-local" defaultValue={defaultOccurredAt} className={inputClass} />
        </Field>
        <Field label="持續（分鐘，選填）" htmlFor="durationMin" error={errors.durationMin}>
          <input id="durationMin" name="durationMin" type="number" inputMode="numeric" className={inputClass} />
        </Field>
      </div>
      <Field label="描述（選填）" htmlFor="note">
        <textarea id="note" name="note" rows={2} maxLength={2000} className={inputClass} />
      </Field>
      {recentFood.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">可能相關的飲食（選填）</legend>
          {recentFood.map((food) => (
            <label key={food.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="relatedFoodEventIds" value={food.id} className="size-4 accent-accent" />
              {food.label}
            </label>
          ))}
        </fieldset>
      )}
      <p className="text-xs text-muted">
        出現胸痛、呼吸困難、昏倒或嚴重過敏反應時，請先撥打 119 或就醫，再補記錄。
      </p>
      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
