import { ConfirmButton } from "@/components/form";
import { formatMl, formatObservation } from "@/lib/format";
import { DRINK_TYPE_LABELS, MEAL_TYPE_LABELS, OBSERVATION_LABELS } from "@/lib/labels";
import type { ObservationType } from "@/lib/schemas/observation";
import { toLocalTime } from "@/lib/time";
import type { listDrinksForDate, listFoodForDate } from "@/server/food";
import type { ObservationRow } from "@/server/observations";
import { deleteEntry } from "../actions";

type Entry = {
  kind: "observation" | "food_event" | "drink_event";
  id: string;
  occurredAt: string;
  title: string;
  detail: string;
  /** 經 AI 擷取、使用者確認的紀錄 */
  ai: boolean;
};

export function buildEntries(
  observations: ObservationRow[],
  food: Awaited<ReturnType<typeof listFoodForDate>>,
  drinks: Awaited<ReturnType<typeof listDrinksForDate>>,
): Entry[] {
  return [
    ...observations.map((o) => ({
      kind: "observation" as const,
      id: o.id,
      occurredAt: o.occurredAt,
      title: OBSERVATION_LABELS[o.type as ObservationType] ?? o.type,
      detail: formatObservation(o.type, o.values),
      ai: o.extractionId !== null,
    })),
    ...food.map((f) => ({
      kind: "food_event" as const,
      id: f.id,
      occurredAt: f.occurredAt,
      title: MEAL_TYPE_LABELS[f.mealType],
      detail: [
        f.items.map((i) => (i.portion ? `${i.name} ${i.portion}` : i.name)).join("、"),
        f.totalNutrition?.kcal !== undefined ? `約 ${Math.round(f.totalNutrition.kcal)} kcal（估算）` : null,
      ]
        .filter(Boolean)
        .join("・"),
      ai: f.extractionId !== null,
    })),
    ...drinks.map((d) => ({
      kind: "drink_event" as const,
      id: d.id,
      occurredAt: d.occurredAt,
      title: DRINK_TYPE_LABELS[d.drinkType],
      detail: [
        d.name,
        d.volumeMl ? formatMl(d.volumeMl) : null,
        d.caffeineMg ? `咖啡因 ${Math.round(d.caffeineMg)} mg` : null,
        d.alcoholG ? `酒精 ${d.alcoholG} g` : null,
      ]
        .filter(Boolean)
        .join("・"),
      ai: d.extractionId !== null,
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function TodayEntries({ entries, timeZone }: { entries: Entry[]; timeZone: string }) {
  return (
    <section aria-labelledby="entries-heading" className="space-y-3">
      <h2 id="entries-heading" className="font-medium">
        今日紀錄
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">今天還沒有紀錄。</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {entries.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`} className="flex items-center gap-3 px-4 py-3">
              <span className="w-12 shrink-0 text-sm tabular-nums text-muted">
                {toLocalTime(entry.occurredAt, timeZone)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {entry.title}
                  {entry.ai && (
                    <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-xs font-normal text-accent">AI</span>
                  )}
                </p>
                <p className="line-clamp-2 text-sm text-muted">{entry.detail}</p>
              </div>
              <form action={deleteEntry}>
                <input type="hidden" name="kind" value={entry.kind} />
                <input type="hidden" name="id" value={entry.id} />
                <ConfirmButton
                  message={`確定要刪除這筆${entry.title}紀錄嗎？`}
                  aria-label={`刪除 ${toLocalTime(entry.occurredAt, timeZone)} 的${entry.title}紀錄`}
                  className="px-2 py-1 text-sm text-muted"
                >
                  刪除
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
