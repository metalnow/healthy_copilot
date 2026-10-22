"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { ChipGroup, Field, FormError, inputClass, SubmitButton } from "@/components/form";
import { KcalInput, kcalTotal } from "@/components/kcal-input";
import { MEAL_TYPES, type MealType } from "@/lib/enums";
import type { ActionState } from "@/lib/form";
import { MEAL_TYPE_LABELS } from "@/lib/labels";
import type { NutritionEstimate } from "@/lib/schemas/common";
import type { AiTaskResult } from "@/server/ai/tasks";
import type { FoodItemDraft } from "@/server/food";

type Row = FoodItemDraft & { key: number };

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  getLastMeal: (mealType: MealType) => Promise<FoodItemDraft[]>;
  defaultMealType: MealType;
  defaultOccurredAt: string;
  recentNames: string[];
  aiConfigured: boolean;
  /** 編輯既有紀錄時的品項與備註 */
  defaults?: { items: FoodItemDraft[]; note?: string };
};

let nextKey = 1;
const newRow = (item: FoodItemDraft = { name: "" }): Row => ({ ...item, key: nextKey++ });

export function FoodForm({
  action,
  getLastMeal,
  defaultMealType,
  defaultOccurredAt,
  recentNames,
  aiConfigured,
  defaults,
}: Props) {
  const [state, formAction] = useActionState(action, {});
  const errors = state.fieldErrors ?? {};
  const editing = Boolean(defaults);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [rows, setRows] = useState<Row[]>(() => (defaults?.items.length ? defaults.items.map((i) => newRow(i)) : [newRow()]));
  const [typed, setTyped] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string>();
  const [copying, startCopy] = useTransition();
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string>();
  const [extractionId, setExtractionId] = useState<string>();

  // 改了品名或份量，AI 估算的熱量就不再適用；自行輸入的熱量保留
  const updateRow = (key: number, patch: Partial<FoodItemDraft>) => {
    setTyped(true);
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...patch, nutrition: r.nutrition?.estimated ? undefined : r.nutrition } : r)),
    );
  };
  const setNutrition = (key: number, nutrition: NutritionEstimate | undefined) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, nutrition } : r)));

  const named = rows.filter((r) => r.name.trim() !== "");
  const needsEstimate = named.some((r) => r.nutrition?.kcal === undefined);

  const estimate = async () => {
    setEstimating(true);
    setEstimateError(undefined);
    try {
      const response = await fetch("/api/ai/food-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: named.map((r) => ({ name: r.name.trim(), portion: r.portion?.trim() || undefined })) }),
      });
      const json = (await response.json().catch(() => null)) as (AiTaskResult & { error?: string }) | null;
      if (!response.ok || !json?.foodNutrition) throw new Error(json?.error ?? "熱量估算失敗");
      const byKey = new Map(named.map((r, i) => [r.key, json.foodNutrition![i]?.nutrition]));
      // 只補上沒有自行輸入熱量的品項
      setRows((current) =>
        current.map((r) => (byKey.has(r.key) && r.nutrition?.estimated !== false ? { ...r, nutrition: byKey.get(r.key) } : r)),
      );
      setExtractionId(json.extractionId);
    } catch (e) {
      setEstimateError(e instanceof Error ? e.message : "熱量估算失敗");
    } finally {
      setEstimating(false);
    }
  };
  const total = kcalTotal(named);

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
      <FormError message={state.error ?? estimateError} />
      <input type="hidden" name="inputType" value={typed ? "text" : "quick_item"} />
      <input type="hidden" name="extractionId" value={extractionId ?? ""} />

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
          {!editing && (
            <button
              type="button"
              onClick={copyLast}
              disabled={copying}
              className="text-sm text-accent disabled:opacity-60"
            >
              {copying ? "載入中…" : `複製上一次${MEAL_TYPE_LABELS[mealType]}`}
            </button>
          )}
        </div>
        {copyMessage && <p className="text-sm text-muted">{copyMessage}</p>}

        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li key={row.key} className="space-y-2">
              <div className="flex gap-2">
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
              </div>
              <input type="hidden" name="itemNutrition" value={row.nutrition ? JSON.stringify(row.nutrition) : ""} />
              <KcalInput
                nutrition={row.nutrition}
                onChange={(nutrition) => setNutrition(row.key, nutrition)}
                label={`第 ${index + 1} 項熱量`}
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setRows((r) => [...r, newRow()])} className="text-sm text-accent">
            ＋ 新增一項
          </button>
          {aiConfigured && named.length > 0 && needsEstimate && (
            <button
              type="button"
              onClick={estimate}
              disabled={estimating}
              className="flex items-center gap-1 rounded-full border border-accent/40 px-3 py-1.5 text-sm text-accent transition active:scale-95 disabled:opacity-60"
            >
              <Sparkles aria-hidden className="size-4" />
              {estimating ? "估算中…" : "AI 估算熱量"}
            </button>
          )}
        </div>
        {total && <p className="text-sm">合計 {total}</p>}
        {errors.items && (
          <p role="alert" className="text-sm text-warning">
            {errors.items}
          </p>
        )}
      </div>

      {!editing && recentNames.length > 0 && (
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
        <input id="note" name="note" defaultValue={defaults?.note} maxLength={2000} className={inputClass} />
      </Field>

      <p className="text-xs text-muted">熱量可自行填寫，或按「AI 估算熱量」依品名與份量估算；估算值會標示「AI 估算」。</p>
      <SubmitButton>儲存</SubmitButton>
    </form>
  );
}
