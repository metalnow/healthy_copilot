"use client";

import { useActionState, useState } from "react";
import { Field, FormError, inputClass, SubmitButton } from "@/components/form";
import type { ActionState } from "@/lib/form";
import { LAB_CATALOG, LAB_CATEGORIES } from "@/lib/labs/catalog";

export function ManualLabForm({
  action,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  today: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [code, setCode] = useState("HBA1C");
  const def = LAB_CATALOG.find((d) => d.code === code);
  const qualitative = def ? def.unit === null && code !== "OTHER" : false;

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Field label="檢驗項目" htmlFor="code" error={errors.code}>
        <select id="code" name="code" value={code} onChange={(e) => setCode(e.target.value)} className={inputClass}>
          {Object.entries(LAB_CATEGORIES).map(([category, label]) => (
            <optgroup key={category} label={label}>
              {LAB_CATALOG.filter((d) => d.category === category).map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      {code === "OTHER" && (
        <Field label="項目名稱" htmlFor="displayName" error={errors.displayName}>
          <input id="displayName" name="displayName" maxLength={100} className={inputClass} />
        </Field>
      )}

      {qualitative ? (
        <Field label="結果" htmlFor="textValue" error={errors.value ?? errors.textValue} hint="例如 陰性、陽性、1:80">
          <input id="textValue" name="textValue" maxLength={500} className={inputClass} />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="數值" htmlFor="value" error={errors.value}>
            <input id="value" name="value" type="number" step="any" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="單位" htmlFor="unit" hint="其他單位會自動換算">
            <input id="unit" name="unit" key={code} defaultValue={def?.unit ?? ""} maxLength={30} className={inputClass} />
          </Field>
        </div>
      )}

      {!qualitative && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="參考下限（選填）" htmlFor="referenceMin">
            <input id="referenceMin" name="referenceMin" type="number" step="any" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="參考上限（選填）" htmlFor="referenceMax">
            <input id="referenceMax" name="referenceMax" type="number" step="any" inputMode="decimal" className={inputClass} />
          </Field>
        </div>
      )}

      <Field label="檢查日期" htmlFor="measuredAt" error={errors.measuredAt}>
        <input id="measuredAt" name="measuredAt" type="date" defaultValue={today} max={today} className={inputClass} />
      </Field>

      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
