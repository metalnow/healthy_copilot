"use client";

import { useActionState } from "react";
import { inputClass } from "@/components/form";
import type { ActionState } from "@/lib/form";

type State = ActionState & { saved?: boolean };

export function ModelProfileForm({
  action,
  modelId,
  label,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  modelId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-1">
      <div className="flex gap-2">
        <input
          name="modelId"
          defaultValue={modelId}
          aria-label={`${label}模型 ID`}
          spellCheck={false}
          autoCapitalize="off"
          className={`${inputClass} font-mono text-sm`}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-accent px-3 text-sm text-accent-foreground disabled:opacity-60"
        >
          {pending ? "檢查中…" : "儲存"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-warning">
          {state.error}
        </p>
      )}
      {state.saved && !pending && <p className="text-sm text-accent">已儲存</p>}
    </form>
  );
}
