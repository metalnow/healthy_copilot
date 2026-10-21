"use client";

import { useState, useTransition } from "react";
import { ChipGroup, FormError, inputClass } from "@/components/form";
import { LOW_CONFIDENCE, type DraftEvent, type DraftFoodItem } from "@/lib/ai/draft";
import { DRINK_TYPES, EXERCISE_TYPES, MEAL_TYPES } from "@/lib/enums";
import {
  DRINK_TYPE_LABELS,
  EXERCISE_TYPE_LABELS,
  MEAL_TYPE_LABELS,
  OBSERVATION_LABELS,
  SEVERITY_LABELS,
  SYMPTOM_LABELS,
} from "@/lib/labels";
import { SYMPTOM_TYPES } from "@/lib/schemas/symptom";
import type { ObservationType } from "@/lib/schemas/observation";
import type { AiTaskResult } from "@/server/ai/tasks";
import { confirmAiDraft, discardAiDraft } from "./actions";

type EditableEvent = DraftEvent & { key: number; include: boolean };

let nextKey = 1;

const MEASUREMENT_FIELDS: Record<ObservationType, { key: string; label: string; step?: string }[]> = {
  weight: [{ key: "weight", label: "體重（kg）", step: "0.1" }],
  blood_pressure: [
    { key: "systolic", label: "收縮壓" },
    { key: "diastolic", label: "舒張壓" },
    { key: "pulse", label: "脈搏（選填）" },
  ],
  heart_rate: [{ key: "bpm", label: "心率（bpm）" }],
  waist: [{ key: "waist", label: "腰圍（cm）", step: "0.1" }],
};

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) return null;
  const low = confidence < LOW_CONFIDENCE;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${low ? "bg-warning/15 text-warning" : "bg-accent/10 text-accent"}`}
    >
      {low ? "信心低，請確認" : `AI 信心 ${Math.round(confidence * 100)}%`}
    </span>
  );
}

function Estimate({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-muted">{children}（估算）</span>;
}

function TimeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="時間"
      className={inputClass}
    />
  );
}

function FoodItems({
  items,
  onChange,
}: {
  items: DraftFoodItem[];
  onChange: (items: DraftFoodItem[]) => void;
}) {
  // 修改品名或份量後，原本的營養估算不再適用
  const edit = (index: number, patch: Partial<DraftFoodItem>) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch, nutrition: undefined, confidence: undefined } : item)),
    );

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="space-y-1">
          <div className="flex gap-2">
            <input
              value={item.name}
              onChange={(e) => edit(index, { name: e.target.value })}
              aria-label={`第 ${index + 1} 項品名`}
              maxLength={100}
              className={`${inputClass} flex-[2]`}
            />
            <input
              value={item.portion ?? ""}
              onChange={(e) => edit(index, { portion: e.target.value || undefined })}
              placeholder="份量"
              aria-label={`第 ${index + 1} 項份量`}
              maxLength={50}
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              aria-label={`移除第 ${index + 1} 項`}
              className="px-2 text-muted"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-1">
            {item.nutrition?.kcal !== undefined && <Estimate>約 {Math.round(item.nutrition.kcal)} kcal</Estimate>}
            {item.confidence !== undefined && item.confidence < LOW_CONFIDENCE && (
              <ConfidenceBadge confidence={item.confidence} />
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { name: "" }])}
        className="text-sm text-accent"
      >
        ＋ 新增一項
      </button>
    </div>
  );
}

function EventCard({
  event,
  onChange,
}: {
  event: EditableEvent;
  onChange: (event: EditableEvent) => void;
}) {
  const update = (patch: Partial<DraftEvent>) => onChange({ ...event, ...patch } as EditableEvent);

  const title =
    event.kind === "food"
      ? "飲食"
      : event.kind === "drink"
        ? "飲料"
        : event.kind === "exercise"
          ? "運動"
          : event.kind === "symptom"
            ? "症狀 / 事件"
            : OBSERVATION_LABELS[event.measurementType];

  return (
    <section
      className={`space-y-3 rounded-xl border bg-surface p-4 ${event.include ? "border-border" : "border-dashed border-border opacity-60"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{title}</h3>
          <ConfidenceBadge confidence={event.confidence} />
        </div>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={event.include}
            onChange={(e) => onChange({ ...event, include: e.target.checked })}
            className="size-4 accent-accent"
          />
          儲存
        </label>
      </div>

      {event.include && (
        <>
          {event.kind === "food" && (
            <>
              <ChipGroup
                name={`meal-${event.key}`}
                label="餐別"
                value={event.mealType}
                onChange={(mealType) => update({ mealType })}
                options={MEAL_TYPES.map((t) => ({ value: t, label: MEAL_TYPE_LABELS[t] }))}
              />
              <FoodItems items={event.items} onChange={(items) => update({ items })} />
            </>
          )}

          {event.kind === "drink" && (
            <>
              <select
                value={event.drinkType}
                onChange={(e) => update({ drinkType: e.target.value as (typeof DRINK_TYPES)[number] })}
                aria-label="飲料類型"
                className={inputClass}
              >
                {DRINK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DRINK_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  value={event.name ?? ""}
                  onChange={(e) => update({ name: e.target.value || undefined })}
                  placeholder="名稱"
                  aria-label="飲料名稱"
                  maxLength={100}
                  className={`${inputClass} flex-[2]`}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={Number.isNaN(event.volumeMl) ? "" : event.volumeMl}
                  onChange={(e) => update({ volumeMl: e.target.valueAsNumber })}
                  aria-label="容量（ml）"
                  className={`${inputClass} flex-1`}
                />
                <span className="self-center text-sm text-muted">ml</span>
              </div>
              {(event.caffeineMg !== undefined || event.sugarG !== undefined || event.alcoholG !== undefined || event.kcal !== undefined) && (
                <Estimate>
                  {[
                    event.caffeineMg !== undefined && `咖啡因 ${Math.round(event.caffeineMg)} mg`,
                    event.sugarG !== undefined && `糖 ${Math.round(event.sugarG)} g`,
                    event.alcoholG !== undefined && `酒精 ${event.alcoholG} g`,
                    event.kcal !== undefined && `約 ${Math.round(event.kcal)} kcal`,
                  ]
                    .filter(Boolean)
                    .join("・")}
                </Estimate>
              )}
            </>
          )}

          {event.kind === "exercise" && (
            <>
              <ChipGroup
                name={`exercise-${event.key}`}
                label="運動類型"
                value={event.exerciseType}
                onChange={(exerciseType) => update({ exerciseType })}
                options={EXERCISE_TYPES.map((t) => ({ value: t, label: EXERCISE_TYPE_LABELS[t] }))}
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={Number.isNaN(event.durationMin) ? "" : event.durationMin}
                  onChange={(e) => update({ durationMin: e.target.valueAsNumber })}
                  aria-label="運動分鐘數"
                  className={`${inputClass} w-28`}
                />
                <span className="text-sm text-muted">分鐘</span>
                <label className="ml-auto flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={event.afterMeal ?? false}
                    onChange={(e) => update({ afterMeal: e.target.checked })}
                    className="size-4 accent-accent"
                  />
                  飯後
                </label>
              </div>
            </>
          )}

          {event.kind === "symptom" && (
            <>
              <select
                value={event.symptomType}
                onChange={(e) => update({ symptomType: e.target.value as typeof event.symptomType })}
                aria-label="症狀類型"
                className={inputClass}
              >
                {SYMPTOM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SYMPTOM_LABELS[t]}
                  </option>
                ))}
              </select>
              <ChipGroup
                name={`severity-${event.key}`}
                label="嚴重度"
                value={String(event.severity) as "1" | "2" | "3" | "4" | "5"}
                onChange={(v) => update({ severity: Number(v) })}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n) as "1", label: `${n} ${SEVERITY_LABELS[n]}` }))}
              />
              <input
                value={event.note ?? ""}
                onChange={(e) => update({ note: e.target.value || undefined })}
                placeholder="描述（選填）"
                aria-label="症狀描述"
                maxLength={500}
                className={inputClass}
              />
            </>
          )}

          {event.kind === "measurement" && (
            <div className="grid grid-cols-2 gap-2">
              {MEASUREMENT_FIELDS[event.measurementType].map((field) => (
                <label key={field.key} className="space-y-1 text-sm">
                  <span className="text-muted">{field.label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={field.step ?? "1"}
                    value={event.values[field.key] ?? ""}
                    onChange={(e) => {
                      const values = { ...event.values };
                      if (e.target.value === "") delete values[field.key];
                      else values[field.key] = e.target.valueAsNumber;
                      update({ values });
                    }}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          )}

          <TimeInput value={event.occurredAt} onChange={(occurredAt) => update({ occurredAt })} />
        </>
      )}
    </section>
  );
}

/** 去掉編輯畫面專用欄位（key、include）與空白品項 */
function toDraftEvent(editable: EditableEvent): DraftEvent {
  const event: Partial<EditableEvent> = { ...editable };
  delete event.key;
  delete event.include;
  const draft = event as DraftEvent;
  return draft.kind === "food" ? { ...draft, items: draft.items.filter((i) => i.name.trim() !== "") } : draft;
}

export function DraftEditor({ result, onReset }: { result: AiTaskResult; onReset: () => void }) {
  const [events, setEvents] = useState<EditableEvent[]>(() =>
    result.drafts.map((d) => ({ ...d, key: nextKey++, include: true })),
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(undefined);
      const selected = events.filter((e) => e.include).map(toDraftEvent);
      const response = await confirmAiDraft({ extractionId: result.extractionId, events: selected });
      if (response?.error) setError(response.error);
    });

  const discard = () =>
    startTransition(async () => {
      await discardAiDraft(result.extractionId);
      onReset();
    });

  return (
    <div className="space-y-4">
      {result.transcript !== undefined && result.transcript !== "" && (
        <p className="rounded-lg bg-surface p-3 text-sm">
          <span className="text-muted">聽到：</span>
          {result.transcript}
        </p>
      )}
      {result.notes && <p className="text-sm text-muted">{result.notes}</p>}
      {result.unparsed && (
        <p className="text-sm text-muted">
          未能歸類的內容：{result.unparsed}
        </p>
      )}

      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
          沒有找到可以記錄的飲食、飲料或量測。
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">請確認 AI 的辨識結果，可直接修改；營養素數值皆為估算。</p>
          {events.map((event) => (
            <EventCard
              key={event.key}
              event={event}
              onChange={(updated) => setEvents((current) => current.map((e) => (e.key === updated.key ? updated : e)))}
            />
          ))}
        </>
      )}

      <FormError message={error} />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={discard}
          disabled={pending}
          className="flex-1 rounded-lg border border-border px-4 py-3 disabled:opacity-60"
        >
          {events.length === 0 ? "重新開始" : "捨棄"}
        </button>
        {events.length > 0 && (
          <button
            type="button"
            onClick={save}
            disabled={pending || !events.some((e) => e.include)}
            className="flex-[2] rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground disabled:opacity-60"
          >
            {pending ? "儲存中…" : "確認儲存"}
          </button>
        )}
      </div>
    </div>
  );
}
