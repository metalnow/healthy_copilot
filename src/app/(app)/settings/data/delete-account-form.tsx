"use client";

import { useActionState } from "react";
import { FormError, inputClass } from "@/components/form";
import type { ActionState } from "@/lib/form";

export function DeleteAccountForm({
  action,
  email,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <FormError message={state.error} />
      <label className="block space-y-1 text-sm">
        <span>輸入你的 Email（{email}）以確認</span>
        <input name="confirmEmail" autoComplete="off" className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!window.confirm("確定要永久刪除帳號與所有健康資料嗎？此操作無法復原。")) e.preventDefault();
        }}
        className="w-full rounded-lg border border-warning/60 px-3 py-2 text-sm text-warning disabled:opacity-60"
      >
        {pending ? "刪除中…" : "永久刪除帳號與所有資料"}
      </button>
    </form>
  );
}
