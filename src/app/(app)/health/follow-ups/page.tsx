import { CalendarCheck, Stethoscope } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AdviceList } from "@/components/advice-list";
import { ConfirmButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { FOLLOW_UP_STATUS_LABELS } from "@/lib/follow-ups";
import { adviceForFinding } from "@/lib/health-advice";
import { toLocalDate } from "@/lib/time";
import { findingSuggestions, listFollowUps, type FollowUpRow } from "@/server/follow-ups";
import { recentIntake } from "@/server/health";
import { adoptFollowUp, changeFollowUp, saveFollowUp } from "../actions";
import { FollowUpForm } from "./follow-up-form";

export const metadata: Metadata = { title: "追蹤事項" };

const SOURCE_LABELS = { report: "報告建議", finding: "檢查發現", manual: "手動新增" } as const;

function StatusButton({ id, action, label }: { id: string; action: string; label: string }) {
  return (
    <form action={changeFollowUp}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" className="text-sm text-muted">
        {label}
      </button>
    </form>
  );
}

function FollowUpCard({
  item,
  today,
  intake,
}: {
  item: FollowUpRow;
  today: string;
  intake: Awaited<ReturnType<typeof recentIntake>>;
}) {
  const active = item.status === "open" || item.status === "scheduled";
  const overdue = active && item.dueDate !== null && item.dueDate < today;
  const advice = adviceForFinding(`${item.finding} ${item.action}`);
  return (
    <li className={`space-y-2 rounded-2xl border bg-surface p-4 ${active ? "border-border" : "border-border opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 font-semibold break-words">{item.finding}</h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            item.status === "scheduled" ? "bg-accent/15 text-accent" : item.status === "open" ? "bg-warning/15 text-warning" : "bg-border text-muted"
          }`}
        >
          {FOLLOW_UP_STATUS_LABELS[item.status]}
        </span>
      </div>
      <p className="flex items-start gap-1.5 text-sm">
        <Stethoscope aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          {item.action}
          {item.department && <span className="text-muted">（{item.department}）</span>}
        </span>
      </p>
      <p className="text-xs text-muted">
        {SOURCE_LABELS[item.source]}
        {item.foundAt && `・${item.foundAt} 發現`}
        {item.dueDate && (
          <span className={overdue ? "text-warning" : ""}>
            ・{item.status === "scheduled" ? "預約" : "建議"} {item.dueDate}
            {overdue && "（已過期）"}
          </span>
        )}
        {item.completedAt && `・${item.completedAt} 完成`}
      </p>
      {item.note && <p className="text-sm text-muted">備註：{item.note}</p>}
      {active && advice.map((a) => <AdviceList key={a.topic} advice={a} intake={intake} />)}

      {active ? (
        <div className="space-y-3 border-t border-border pt-3">
          <form action={changeFollowUp} className="flex items-center gap-2">
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="action" value="schedule" />
            <label className="sr-only" htmlFor={`due-${item.id}`}>
              追蹤日期
            </label>
            <input
              id={`due-${item.id}`}
              type="date"
              name="dueDate"
              required
              defaultValue={item.dueDate ?? ""}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <button type="submit" className="shrink-0 rounded-full border border-accent px-3 py-1.5 text-sm text-accent">
              {item.status === "scheduled" ? "改日期" : "已預約"}
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <form action={changeFollowUp}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="action" value="done" />
              <button type="submit" className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground">
                <CalendarCheck aria-hidden className="size-4" />
                已完成
              </button>
            </form>
            <StatusButton id={item.id} action="dismissed" label="不追蹤" />
          </div>
        </div>
      ) : (
        <div className="flex gap-5 border-t border-border pt-3">
          <StatusButton id={item.id} action="open" label="重新追蹤" />
          <form action={changeFollowUp}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="action" value="delete" />
            <ConfirmButton message="確定要刪除這個追蹤事項嗎？" className="text-sm text-muted">
              刪除
            </ConfirmButton>
          </form>
        </div>
      )}
    </li>
  );
}

export default async function FollowUpsPage() {
  const user = await requireUser();
  const db = await getDb();
  const followUps = await listFollowUps(db, user.id);
  const [suggestions, intake] = await Promise.all([findingSuggestions(db, user.id, followUps), recentIntake(db, user)]);
  const today = toLocalDate(new Date(), user.timezone);
  const active = followUps.filter((f) => f.status === "open" || f.status === "scheduled");
  const closed = followUps.filter((f) => f.status === "done" || f.status === "dismissed");

  return (
    <div className="space-y-6">
      <PageHeader title="追蹤事項" backHref="/health" backLabel="健康" />
      <p className="text-sm text-muted">
        健檢報告建議的複檢、回診，以及超音波等檢查的異常發現。安排好時間就標記「已預約」，做完標記「已完成」。
      </p>

      {suggestions.length > 0 && (
        <section aria-labelledby="finding-heading" className="space-y-3">
          <h2 id="finding-heading" className="font-semibold">
            檢查結果中可能需要追蹤的項目
          </h2>
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.labKey} className="space-y-2 rounded-2xl border border-accent/40 bg-accent/5 p-4">
                <p className="text-sm font-medium break-words">{s.finding}</p>
                <p className="text-sm text-muted">{s.action}</p>
                <p className="text-xs text-muted">{s.foundAt}</p>
                <div className="flex items-center gap-4">
                  {[false, true].map((dismiss) => (
                    <form key={String(dismiss)} action={adoptFollowUp}>
                      <input type="hidden" name="finding" value={s.finding} />
                      <input type="hidden" name="action" value={s.action} />
                      <input type="hidden" name="labKey" value={s.labKey} />
                      <input type="hidden" name="foundAt" value={s.foundAt} />
                      <input type="hidden" name="sourceDocumentId" value={s.sourceDocumentId ?? ""} />
                      <input type="hidden" name="source" value="finding" />
                      {dismiss && <input type="hidden" name="dismiss" value="1" />}
                      <button
                        type="submit"
                        className={
                          dismiss
                            ? "text-sm text-muted"
                            : "rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground active:scale-95"
                        }
                      >
                        {dismiss ? "不需要" : "加入追蹤"}
                      </button>
                    </form>
                  ))}
                  <Link href={`/health/labs/${encodeURIComponent(s.labKey)}`} className="text-sm text-accent">
                    看紀錄
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">依報告的異常標示與結果文字判斷，是否需要追蹤請以報告與醫師建議為準。</p>
        </section>
      )}

      {active.length > 0 ? (
        <ul className="space-y-3">
          {active.map((item) => (
            <FollowUpCard key={item.id} item={item} today={today} intake={intake} />
          ))}
        </ul>
      ) : (
        suggestions.length === 0 && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            目前沒有待追蹤的事項。確認健檢報告時，AI 會整理報告上的追蹤建議供你確認。
          </p>
        )
      )}

      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer font-semibold">＋ 自己新增追蹤事項</summary>
        <div className="mt-4">
          <FollowUpForm action={saveFollowUp} />
        </div>
      </details>

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-muted">已完成 / 不追蹤</h2>
          <ul className="space-y-3">
            {closed.map((item) => (
              <FollowUpCard key={item.id} item={item} today={today} intake={intake} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
