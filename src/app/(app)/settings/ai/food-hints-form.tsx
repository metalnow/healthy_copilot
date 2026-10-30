"use client";

import { useActionState } from "react";
import { FormError, inputClass } from "@/components/form";
import type { ActionState } from "@/lib/form";

export function FoodHintsForm({
  action,
  defaultValue,
}: {
  action: (prev: ActionState & { saved?: boolean }, formData: FormData) => Promise<ActionState & { saved?: boolean }>;
  defaultValue: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <FormError message={state.error} />
      <textarea
        name="hints"
        defaultValue={defaultValue}
        rows={3}
        maxLength={500}
        placeholder="例如：家裡的飯碗是小碗（約 250 ml）；吃麵通常一球；滷肉飯習慣半碗飯"
        aria-label="飲食習慣說明"
        className={inputClass}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{state.saved ? "已儲存" : "不要填姓名等個人資料"}</span>
        <button type="submit" disabled={pending} className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-60">
          {pending ? "儲存中…" : "儲存"}
        </button>
      </div>
    </form>
  );
}
