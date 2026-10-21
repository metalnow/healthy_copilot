"use client";

import { useActionState, useState, useTransition } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { MEAL_TYPES, type MealType } from "@/lib/enums";
import type { ActionState } from "@/lib/form";
import { MEAL_TYPE_LABELS } from "@/lib/labels";
import type { FoodItemDraft } from "@/server/food";

type Row = FoodItemDraft & { key: number };

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  getLastMeal: (mealType: MealType) => Promise<FoodItemDraft[]>;
  defaultMealType: MealType;
  defaultOccurredAt: string;
  recentNames: string[];
};

let nextKey = 1;
const newRow = (item: FoodItemDraft = { name: "" }): Row => ({ ...item, key: nextKey++ });

export function FoodForm({ action, getLastMeal, defaultMealType, defaultOccurredAt, recentNames }: Props) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [typed, setTyped] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string>();
  const [copying, startCopy] = useTransition();

  const updateRow = (key: number, patch: Partial<FoodItemDraft>) => {
    setTyped(true);
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addItem = (item: FoodItemDraft) =>
    setRows((current) => {
      const filled = current.filter((r) => r.name.trim() !== "");
      return [...filled, newRow(item)];
    });

  const copyLast = () =>
    startCopy(async () => {
      const items = await getLastMeal(mealType);
      if (items.length === 0) {
        setCopyMessage(`還沒有${MEAL_TYPE_LABELS[mealType]}的紀錄`);
        return;
      }
      setCopyMessage(undefined);
      setTyped(false);
      setRows(items.map((item) => newRow(item)));
    });

  return (
    <form action={formAction} className="space-y-5">
      <FormError message={state.error} />
      <input type="hidden" name="inputType" value={typed ? "text" : "quick_item"} />

      <Field label="餐別" error={errors.mealType}>
        <ChipGroup
          name="mealType"
          label="餐別"
          value={mealType}
          onChange={setMealType}
          options={MEAL_TYPES.map((t) => ({ value: t, label: MEAL_TYPE_LABELS[t] }))}
        />
      </Field>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">吃了什麼</span>
          <button
            type="button"
            onClick={copyLast}
            disabled={copying}
            className="text-sm text-accent disabled:opacity-60"
          >
            {copying ? "載入中…" : `複製上一次${MEAL_TYPE_LABELS[mealType]}`}
          </button>
        </div>
        {copyMessage && <p className="text-sm text-muted">{copyMessage}</p>}

        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={row.key} className="flex gap-2">
              <input
                name="itemName"
                value={row.name}
                onChange={(e) => updateRow(row.key, { name: e.target.value })}
                placeholder={index === 0 ? "例如 雞腿便當" : "品名"}
                aria-label={`第 ${index + 1} 項品名`}
                maxLength={100}
                className={`${inputClass} flex-[2]`}
              />
              <input
                name="itemPortion"
                value={row.portion ?? ""}
                onChange={(e) => updateRow(row.key, { portion: e.target.value })}
                placeholder="份量"
                aria-label={`第 ${index + 1} 項份量`}
                maxLength={50}
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={() =>
                  setRows((current) =>
                    current.length === 1 ? [newRow()] : current.filter((r) => r.key !== row.key),
                  )
                }
                aria-label={`移除第 ${index + 1} 項`}
                className="px-2 text-muted"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setRows((r) => [...r, newRow()])} className="text-sm text-accent">
          ＋ 新增一項
        </button>
        {errors.items && (
          <p role="alert" className="text-sm text-warning">
            {errors.items}
          </p>
        )}
      </div>

      {recentNames.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium">最近吃過</span>
          <div className="flex flex-wrap gap-2">
            {recentNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => addItem({ name })}
                className="rounded-full border border-border px-3 py-1.5 text-sm"
              >
                ＋ {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Field label="時間" htmlFor="occurredAt" error={errors.occurredAt}>
        <input
          id="occurredAt"
          name="occurredAt"
          type="datetime-local"
          defaultValue={defaultOccurredAt}
          className={inputClass}
        />
      </Field>

      <Field label="備註（選填）" htmlFor="note">
        <input id="note" name="note" maxLength={2000} className={inputClass} />
      </Field>

      <p className="text-xs text-muted">營養素估算將於 AI 功能上線後提供，屆時會標示為估算值。</p>
      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
