import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { formatLongDate, formatMl } from "@/lib/format";
import { DRINK_TYPE_LABELS, MEAL_TYPE_LABELS } from "@/lib/labels";
import {
  drinkIntake,
  foodIntake,
  formatNutrient,
  macroShares,
  NUTRIENTS,
  sumIntake,
  type IntakeRow,
  type NutrientKey,
} from "@/lib/nutrition";
import { toLocalDate, toLocalTime } from "@/lib/time";
import { listDrinksForDate, listFoodForDate } from "@/server/food";
import { addDays } from "@/server/insights";
import { totalKcalForDate } from "@/server/lifestyle";

export const metadata: Metadata = { title: "營養攝取" };

/** 明細表的欄位 */
const COLUMNS: NutrientKey[] = ["kcal", "proteinG", "fatG", "carbG", "sugarG", "sodiumMg"];
const SHORT_LABELS: Partial<Record<NutrientKey, string>> = { carbG: "碳水", sodiumMg: "鈉" };

type Entry = { row: IntakeRow; title: string; detail: string; href: string; water: boolean };

export default async function NutritionPage({ searchParams }: PageProps<"/nutrition">) {
  const user = await requireUser();
  const today = toLocalDate(new Date(), user.timezone);
  const { date } = await searchParams;
  const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;

  const db = await getDb();
  const [food, drinks, burned] = await Promise.all([
    listFoodForDate(db, user.id, day),
    listDrinksForDate(db, user.id, day),
    totalKcalForDate(db, user.id, day),
  ]);
  const entries: Entry[] = [
    ...food.map((f) => ({
      row: foodIntake(f),
      title: MEAL_TYPE_LABELS[f.mealType],
      detail: f.items.map((i) => i.name).join("、"),
      href: `/log/food/${f.id}`,
      water: false,
    })),
    ...drinks.map((d) => ({
      row: drinkIntake(d),
      title: DRINK_TYPE_LABELS[d.drinkType],
      detail: [d.name, d.volumeMl && formatMl(d.volumeMl)].filter(Boolean).join(" "),
      href: `/log/drink/${d.id}`,
      water: d.drinkType === "water",
    })),
  ].sort((a, b) => a.row.occurredAt.localeCompare(b.row.occurredAt));

  const { totals, estimated, missingKcal } = sumIntake(entries.map((e) => e.row));
  const shares = macroShares(totals);
  // 明細表不列出水（沒有營養素）
  const tableEntries = entries.filter((e) => !e.water);

  return (
    <div className="space-y-5">
      <PageHeader title="營養攝取" />

      <nav aria-label="日期" className="flex items-center justify-between">
        <Link href={`/nutrition?date=${addDays(day, -1)}`} aria-label="前一天" className="flex size-11 items-center justify-center rounded-full active:bg-border">
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <span className="font-medium">{day === today ? `今天・${formatLongDate(day)}` : formatLongDate(day)}</span>
        {day < today ? (
          <Link href={`/nutrition?date=${addDays(day, 1)}`} aria-label="後一天" className="flex size-11 items-center justify-center rounded-full active:bg-border">
            <ChevronRight aria-hidden className="size-5" />
          </Link>
        ) : (
          <span className="size-11" />
        )}
      </nav>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">這天還沒有飲食或飲料紀錄。</p>
      ) : (
        <>
          <section aria-label="總計" className="space-y-4 rounded-2xl border border-border bg-surface p-4">
            <div>
              <p className="text-sm text-muted">總熱量（飲食＋飲料）</p>
              <p className="text-3xl font-bold tabular-nums">
                {estimated && totals.kcal ? "約 " : ""}
                {formatNutrient("kcal", totals.kcal ?? 0)}
                <span className="ml-1 text-base font-normal text-muted">kcal</span>
              </p>
              {burned !== null && (
                <p className="mt-1 text-sm text-muted">
                  手錶記錄消耗 {formatNutrient("kcal", burned)} kcal
                  {totals.kcal !== undefined &&
                    `・攝取${totals.kcal >= burned ? "多" : "少"} ${formatNutrient("kcal", Math.abs(totals.kcal - burned))} kcal`}
                  {day === today && "（今天還沒結束，消耗會再增加）"}
                </p>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-2">
              {(
                [
                  ["proteinG", "蛋白質", shares?.protein],
                  ["fatG", "脂肪", shares?.fat],
                  ["carbG", "碳水", shares?.carb],
                ] as const
              ).map(([key, label, share]) => (
                <div key={key} className="rounded-xl bg-background p-2.5">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatNutrient(key, totals[key])}
                    <span className="ml-0.5 text-xs font-normal text-muted">g</span>
                  </dd>
                  {share !== undefined && <dd className="text-xs text-muted">熱量 {share}%</dd>}
                </div>
              ))}
            </dl>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
              {NUTRIENTS.filter((n) => !["kcal", "proteinG", "fatG", "carbG"].includes(n.key)).map((n) => (
                <div key={n.key} className="flex justify-between border-b border-border py-1">
                  <dt className="text-muted">{n.label}</dt>
                  <dd className="tabular-nums">
                    {formatNutrient(n.key, totals[n.key])} {totals[n.key] !== undefined && n.unit}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="detail-heading" className="space-y-2">
            <h2 id="detail-heading" className="font-semibold">
              明細
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
              <table className="w-full min-w-[520px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-3 py-2 font-normal">項目</th>
                    {COLUMNS.map((key) => {
                      const n = NUTRIENTS.find((x) => x.key === key)!;
                      return (
                        <th key={key} className="px-2 py-2 text-right font-normal whitespace-nowrap">
                          {SHORT_LABELS[key] ?? n.label}
                          <span className="block">{n.unit}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tableEntries.map((e) => (
                    <tr key={`${e.row.kind}:${e.row.id}`} className="border-b border-border last:border-0">
                      <td className="max-w-40 px-3 py-2">
                        <Link href={e.href} className="block active:opacity-60">
                          <span className="text-xs text-muted">{toLocalTime(e.row.occurredAt, user.timezone)} </span>
                          {e.title}
                          {e.row.estimated && <span className="ml-1 text-xs text-accent">估</span>}
                          {e.detail && <span className="block truncate text-xs text-muted">{e.detail}</span>}
                        </Link>
                      </td>
                      {COLUMNS.map((key) => (
                        <td key={key} className={`px-2 py-2 text-right ${e.row.values[key] === undefined ? "text-muted" : ""}`}>
                          {formatNutrient(key, e.row.values[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-3 py-2">合計</td>
                    {COLUMNS.map((key) => (
                      <td key={key} className="px-2 py-2 text-right">
                        {formatNutrient(key, totals[key])}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted">
              標示「估」的數值為 AI 依品名與份量估算，僅供參考；「—」代表沒有資料。
              {missingKcal > 0 && ` 有 ${missingKcal} 筆沒有熱量、未計入總熱量，點該筆可補填或用 AI 估算。`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
