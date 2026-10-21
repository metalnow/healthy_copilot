import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toLocalDate, weekdayOfLocalDate } from "@/lib/time";
import { WEEKDAY_LABELS } from "@/lib/labels";
import { getTimeline, TIMELINE_CATEGORIES, type TimelineCategory } from "@/server/timeline";
import { EntryList } from "../_components/entry-list";

export const metadata: Metadata = { title: "時間軸" };

const WINDOW_DAYS = 7;

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function TimelinePage({ searchParams }: PageProps<"/timeline">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = toLocalDate(new Date(), user.timezone);
  const before = typeof params.before === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.before) && params.before <= today ? params.before : today;
  const category =
    typeof params.type === "string" && params.type in TIMELINE_CATEGORIES ? (params.type as TimelineCategory) : null;
  const from = addDays(before, -(WINDOW_DAYS - 1));

  const items = (await getTimeline(await getDb(), user, from, before)).filter((i) => !category || i.category === category);
  const byDate = new Map<string, typeof items>();
  for (const item of items) byDate.set(item.localDate, [...(byDate.get(item.localDate) ?? []), item]);

  const href = (overrides: { before?: string | null; type?: string | null }) => {
    const query = new URLSearchParams();
    const b = overrides.before === undefined ? (before === today ? null : before) : overrides.before;
    const t = overrides.type === undefined ? category : overrides.type;
    if (b) query.set("before", b);
    if (t) query.set("type", t);
    const qs = query.toString();
    return qs ? `/timeline?${qs}` : "/timeline";
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">時間軸</h1>
        <p className="text-sm text-muted">
          {from} – {before}
        </p>
      </div>

      <nav aria-label="篩選" className="flex flex-wrap gap-2">
        <Link
          href={href({ type: null })}
          aria-current={!category ? "page" : undefined}
          className="rounded-full border border-border px-3 py-1 text-sm aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
        >
          全部
        </Link>
        {(Object.entries(TIMELINE_CATEGORIES) as [TimelineCategory, string][]).map(([key, label]) => (
          <Link
            key={key}
            href={href({ type: key })}
            aria-current={category === key ? "page" : undefined}
            className="rounded-full border border-border px-3 py-1 text-sm aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
          >
            {label}
          </Link>
        ))}
      </nav>

      {byDate.size === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">這段期間沒有紀錄。</p>
      ) : (
        [...byDate.entries()].map(([date, dayItems]) => (
          <section key={date} className="space-y-2">
            <h2 className="text-sm font-medium text-muted">
              {date === today ? "今天" : date}（{WEEKDAY_LABELS[weekdayOfLocalDate(date)]}）
            </h2>
            <EntryList items={dayItems} />
          </section>
        ))
      )}

      <div className="flex justify-between text-sm">
        <Link href={href({ before: addDays(from, -1) })} className="text-accent">
          ← 更早
        </Link>
        {before < today && (
          <Link href={href({ before: addDays(before, WINDOW_DAYS) > today ? null : addDays(before, WINDOW_DAYS) })} className="text-accent">
            較新 →
          </Link>
        )}
      </div>
    </div>
  );
}
