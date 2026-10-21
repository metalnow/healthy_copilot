"use client";

import { useActionState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import type { ActionState } from "@/lib/form";
import type { ObservationType } from "@/lib/schemas/observation";

type Props = {
  type: ObservationType;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaultOccurredAt: string;
};

function NumberInput({
  name,
  error,
  step = "1",
  placeholder,
  autoFocus,
}: {
  name: string;
  error?: string;
  step?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      id={name}
      name={name}
      type="number"
      inputMode={step === "1" ? "numeric" : "decimal"}
      step={step}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-invalid={error ? true : undefined}
      className={inputClass}
    />
  );
}

export function MeasurementForm({ type, action, defaultOccurredAt }: Props) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error ?? errors.form} />

      {type === "weight" && (
        <Field label="體重（kg）" htmlFor="weight" error={errors.weight}>
          <NumberInput name="weight" step="0.1" placeholder="例如 72.5" error={errors.weight} autoFocus />
        </Field>
      )}

      {type === "waist" && (
        <Field label="腰圍（cm）" htmlFor="waist" error={errors.waist} hint="站立、吐氣後，於肚臍上緣水平量測">
          <NumberInput name="waist" step="0.1" placeholder="例如 88" error={errors.waist} autoFocus />
        </Field>
      )}

      {type === "heart_rate" && (
        <Field label="心率（bpm）" htmlFor="bpm" error={errors.bpm} hint="靜止休息 5 分鐘後量測">
          <NumberInput name="bpm" placeholder="例如 68" error={errors.bpm} autoFocus />
        </Field>
      )}

      {type === "blood_pressure" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="收縮壓（上）" htmlFor="systolic" error={errors.systolic}>
              <NumberInput name="systolic" placeholder="120" error={errors.systolic} autoFocus />
            </Field>
            <Field label="舒張壓（下）" htmlFor="diastolic" error={errors.diastolic}>
              <NumberInput name="diastolic" placeholder="80" error={errors.diastolic} />
            </Field>
          </div>
          <Field label="脈搏（選填）" htmlFor="pulse" error={errors.pulse} hint="會同時記錄為一筆心率">
            <NumberInput name="pulse" placeholder="70" error={errors.pulse} />
          </Field>

          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">量測情境（選填）</summary>
            <div className="mt-3 space-y-3">
              <Field label="姿勢">
                <ChipGroup
                  name="position"
                  label="姿勢"
                  defaultValue="sitting"
                  options={[
                    { value: "sitting", label: "坐姿" },
                    { value: "standing", label: "站姿" },
                    { value: "lying", label: "躺姿" },
                  ]}
                />
              </Field>
              <Field label="手臂">
                <ChipGroup
                  name="arm"
                  label="手臂"
                  options={[
                    { value: "left", label: "左手" },
                    { value: "right", label: "右手" },
                  ]}
                />
              </Field>
              <Field label="量測前休息（分鐘）" htmlFor="afterRestMinutes">
                <input
                  id="afterRestMinutes"
                  name="afterRestMinutes"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  defaultValue={5}
                  className={inputClass}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="beforeBreakfast" className="size-4 accent-accent" />
                早餐前量測
              </label>
              {errors.context && <p className="text-sm text-warning">{errors.context}</p>}
            </div>
          </details>
        </>
      )}

      <Field label="量測時間" htmlFor="occurredAt" error={errors.occurredAt}>
        <input
          id="occurredAt"
          name="occurredAt"
          type="datetime-local"
          defaultValue={defaultOccurredAt}
          aria-invalid={errors.occurredAt ? true : undefined}
          className={inputClass}
        />
      </Field>

      <Field label="備註（選填）" htmlFor="note" error={errors.note}>
        <input id="note" name="note" maxLength={2000} className={inputClass} />
      </Field>

      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
