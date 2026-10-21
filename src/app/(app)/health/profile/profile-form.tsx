"use client";

import { useActionState } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import type { ActionState } from "@/lib/form";

type State = ActionState & { saved?: boolean };

export type ProfileDefaults = {
  sex: "male" | "female" | "other" | null;
  birthYear: number | null;
  heightCm: number | null;
  allergies: string[];
  conditions: string[];
  note: string | null;
};

export function ProfileForm({
  action,
  defaults,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  defaults: ProfileDefaults;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      {state.saved && <p className="text-sm text-accent">已儲存</p>}
      <Field label="性別">
        <ChipGroup
          name="sex"
          label="性別"
          defaultValue={defaults.sex ?? undefined}
          options={[
            { value: "male", label: "男" },
            { value: "female", label: "女" },
            { value: "other", label: "其他" },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="出生年（西元）" htmlFor="birthYear">
          <input id="birthYear" name="birthYear" type="number" inputMode="numeric" defaultValue={defaults.birthYear ?? ""} className={inputClass} />
        </Field>
        <Field label="身高（cm）" htmlFor="heightCm">
          <input id="heightCm" name="heightCm" type="number" step="0.1" inputMode="decimal" defaultValue={defaults.heightCm ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="過敏（藥物、食物等）" htmlFor="allergies" hint="以逗號或換行分隔">
        <textarea id="allergies" name="allergies" rows={2} defaultValue={defaults.allergies.join("、")} className={inputClass} />
      </Field>
      <Field label="慢性病 / 病史" htmlFor="conditions" hint="以逗號或換行分隔">
        <textarea id="conditions" name="conditions" rows={2} defaultValue={defaults.conditions.join("、")} className={inputClass} />
      </Field>
      <Field label="備註" htmlFor="note">
        <textarea id="note" name="note" rows={3} maxLength={2000} defaultValue={defaults.note ?? ""} className={inputClass} />
      </Field>
      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
