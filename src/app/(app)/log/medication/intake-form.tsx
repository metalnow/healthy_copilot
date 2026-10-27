"use client";

import { useActionState, useState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { MEDICATION_CATEGORIES } from "@/lib/enums";
import type { ActionState } from "@/lib/form";
import { MEDICATION_CATEGORY_LABELS } from "@/lib/labels";

export type IntakeOption = { id: string; name: string; dose: number | null; unit: string | null; asNeeded: boolean };

export function IntakeForm({
  action,
  options,
  defaultTakenAt,
  defaultMedicationId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  options: IntakeOption[];
  defaultTakenAt: string;
  defaultMedicationId?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const initial = options.find((o) => o.id === defaultMedicationId);
  // 還沒有任何品項時直接新增
  const [selected, setSelected] = useState(initial?.id ?? (options.length === 0 ? "new" : ""));
  const [dose, setDose] = useState(initial?.dose != null ? String(initial.dose) : "");
  const current = options.find((o) => o.id === selected);
  const unit = selected === "new" ? undefined : current?.unit;

  const choose = (id: string) => {
    setSelected(id);
    const option = options.find((o) => o.id === id);
    setDose(option?.dose != null ? String(option.dose) : "");
  };

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">吃了什麼</legend>
        <div className="grid grid-cols-2 gap-2">
          {[...options, { id: "new", name: "＋ 其他品項", dose: null, unit: null, asNeeded: false }].map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected === option.id}
              onClick={() => choose(option.id)}
              className="min-w-0 rounded-xl border border-border bg-surface px-3 py-2.5 text-left text-sm aria-pressed:border-accent aria-pressed:bg-accent/10"
            >
              <span className="block truncate font-medium">{option.name}</span>
              {option.id !== "new" && (
                <span className="block truncate text-xs text-muted">
                  {[option.dose != null ? `${option.dose}${option.unit ? ` ${option.unit}` : ""}` : option.unit, option.asNeeded ? "需要時" : null]
                    .filter(Boolean)
                    .join("・") || "—"}
                </span>
              )}
            </button>
          ))}
        </div>
        <input type="hidden" name="medicationId" value={selected} />
        {errors.medicationId && (
          <p role="alert" className="text-sm text-warning">
            {errors.medicationId}
          </p>
        )}
      </fieldset>

      {selected === "new" && (
        <div className="space-y-4 rounded-xl border border-border p-3">
          <Field label="名稱" htmlFor="newName" error={errors.newName}>
            <input id="newName" name="newName" maxLength={100} placeholder="例如 維他命 C、普拿疼" className={inputClass} />
          </Field>
          <Field label="類別">
            <ChipGroup
              name="category"
              label="類別"
              defaultValue="supplement"
              options={MEDICATION_CATEGORIES.map((c) => ({ value: c, label: MEDICATION_CATEGORY_LABELS[c] }))}
            />
          </Field>
          <Field label="單位" htmlFor="unit" hint="會加入用藥清單（需要時才吃），下次可以直接選">
            <input id="unit" name="unit" maxLength={20} placeholder="顆、錠、mg、包" className={inputClass} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={`份量${unit ? `（${unit}）` : ""}`} htmlFor="dose" error={errors.dose} hint="選填，例如 2 顆">
          <input
            id="dose"
            name="dose"
            type="number"
            step="any"
            inputMode="decimal"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="時間" htmlFor="takenAt" error={errors.takenAt}>
          <input id="takenAt" name="takenAt" type="datetime-local" defaultValue={defaultTakenAt} className={inputClass} />
        </Field>
      </div>
      <SubmitButton>記錄服用</SubmitButton>
    </form>
  );
}
