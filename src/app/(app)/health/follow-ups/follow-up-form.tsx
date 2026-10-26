"use client";

import { useActionState } from "react";
import { Field, FormError, inputClass, SubmitButton } from "@/components/form";
import type { ActionState } from "@/lib/form";

export function FollowUpForm({ action }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <Field label="要追蹤的發現" htmlFor="finding" error={errors.finding}>
        <input id="finding" name="finding" maxLength={200} placeholder="例如 膽囊息肉 0.4 cm" className={inputClass} />
      </Field>
      <Field label="建議的作法" htmlFor="action" error={errors.action}>
        <input id="action" name="action" maxLength={300} placeholder="例如 6 個月後複檢腹部超音波" className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="科別（選填）" htmlFor="department">
          <input id="department" name="department" maxLength={50} placeholder="肝膽腸胃科" className={inputClass} />
        </Field>
        <Field label="追蹤日期（選填）" htmlFor="dueDate" error={errors.dueDate}>
          <input id="dueDate" name="dueDate" type="date" className={inputClass} />
        </Field>
      </div>
      <SubmitButton>新增追蹤事項</SubmitButton>
    </form>
  );
}
