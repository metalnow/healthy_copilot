"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 aria-[invalid=true]:border-warning";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-sm text-warning">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-warning/40 px-3 py-2 text-sm text-warning">
      {message}
    </p>
  );
}

/** 送出按鈕：固定在畫面底部（像 App 的主要動作），表單很長時也不用捲到底 */
export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 z-10 -mx-4 bg-gradient-to-t from-background via-background to-transparent px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-accent px-4 py-3.5 font-medium text-accent-foreground shadow-sm transition active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "儲存中…" : children}
      </button>
    </div>
  );
}

/** 單選按鈕組（外觀為 chip） */
export function ChipGroup<T extends string>({
  name,
  options,
  value,
  defaultValue,
  onChange,
  label,
}: {
  name: string;
  options: readonly { value: T; label: string }[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label key={option.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={option.value}
            className="peer sr-only"
            {...(value !== undefined
              ? { checked: value === option.value, onChange: () => onChange?.(option.value) }
              : { defaultChecked: defaultValue === option.value })}
          />
          <span className="block rounded-full border border-border px-3.5 py-2 text-sm transition active:scale-95 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/** 送出前先跳出確認視窗 */
export function ConfirmButton({
  message,
  children,
  ...props
}: ComponentProps<"button"> & { message: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
