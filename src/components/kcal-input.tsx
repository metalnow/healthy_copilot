"use client";

import { inputClass } from "@/components/form";
import type { NutritionEstimate } from "@/lib/schemas/common";

type Props = {
  nutrition?: NutritionEstimate;
  onChange: (nutrition: NutritionEstimate | undefined) => void;
  label: string;
};

/** 單一品項的熱量：可直接輸入；AI 估算值標示「估算」，手動修改後改為使用者輸入 */
export function KcalInput({ nutrition, onChange, label }: Props) {
  const kcal = nutrition?.kcal;
  return (
    <div className="flex items-center gap-2">
      <div className="w-28">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={10000}
          value={kcal !== undefined ? Math.round(kcal) : ""}
          onChange={(e) => {
            const value = e.target.value === "" ? undefined : Number(e.target.value);
            onChange(value === undefined || Number.isNaN(value) ? undefined : { estimated: false, kcal: value });
          }}
          placeholder="熱量"
          aria-label={label}
          className={inputClass}
        />
      </div>
      <span className="text-sm text-muted">kcal</span>
      {nutrition?.estimated && kcal !== undefined && (
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">AI 估算</span>
      )}
    </div>
  );
}

/** 品項熱量合計；任一項為估算時標示「約」 */
export function kcalTotal(items: { nutrition?: NutritionEstimate }[]) {
  const withKcal = items.filter((i) => i.nutrition?.kcal !== undefined);
  if (withKcal.length === 0) return null;
  const total = Math.round(withKcal.reduce((sum, i) => sum + i.nutrition!.kcal!, 0));
  const estimated = withKcal.some((i) => i.nutrition!.estimated);
  return `${estimated ? "約 " : ""}${total.toLocaleString("zh-TW")} kcal${estimated ? "（含估算）" : ""}`;
}
