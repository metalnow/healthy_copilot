"use client";

import { useActionState } from "react";
import { Field, FormError, inputClass, SubmitButton } from "@/components/form";
import type { ActionState } from "@/lib/form";
import { BEHAVIOR_METRICS, GOAL_METRICS } from "@/lib/goals";

export function GoalForm({
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
      <Field label="指標" htmlFor="metric" error={errors.metric}>
        <select id="metric" name="metric" defaultValue="HBA1C" className={inputClass}>
          <optgroup label="檢驗 / 量測">
            {GOAL_METRICS.filter((m) => m.kind === "lab").map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
                {m.unit ? `（${m.unit}）` : ""}
              </option>
            ))}
          </optgroup>
          <optgroup label="生活習慣">
            {BEHAVIOR_METRICS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}（{m.unit}）
              </option>
            ))}
          </optgroup>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="目標值" htmlFor="targetValue" error={errors.targetValue}>
          <input id="targetValue" name="targetValue" type="number" step="any" inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="基準值（選填）" htmlFor="baselineValue" hint="留空則用目前最新值">
          <input id="baselineValue" name="baselineValue" type="number" step="any" inputMode="decimal" className={inputClass} />
        </Field>
      </div>
      <Field label="目標日期（選填）" htmlFor="targetDate" error={errors.targetDate}>
        <input id="targetDate" name="targetDate" type="date" min={today} className={inputClass} />
      </Field>
      <SubmitButton>新增目標</SubmitButton>
    </form>
  );
}
