import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { getLabDefinition, LAB_CATEGORIES, labDisplayName, type LabCategory } from "@/lib/labs/catalog";
import { formatLabValue, isLongLabText, labFlag } from "@/lib/labs/format";
import { toLocalDate } from "@/lib/time";
import { findingSuggestions, listFollowUps } from "@/server/follow-ups";
import { getHealthProfile, goalSuggestions, listGoals, listHealthDocuments, listLabs, summarizeLabs } from "@/server/health";

export const metadata: Metadata = { title: "健康" };

const SEX_LABELS = { male: "男", female: "女", other: "其他" } as const;

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Trend({ latest, previous }: { latest: number | null; previous: number | null | undefined }) {
  if (latest === null || previous == null || latest === previous) return null;
  const up = latest > previous;
  return (
    <span className="text-xs text-muted" title={`前次 ${previous}`}>
      {up ? "↑" : "↓"} {Math.abs(Math.round((latest - previous) * 100) / 100)}
    </span>
  );
}

export default async function HealthPage() {
  const user = await requireUser();
  const db = await getDb();
  const [profile, labs, documents, goals, suggestions, followUps] = await Promise.all([
    getHealthProfile(db, user.id),
    listLabs(db, user.id),
    listHealthDocuments(db, user.id),
    listGoals(db, user.id),
    goalSuggestions(db, user),
    listFollowUps(db, user.id),
  ]);
  const suggestionCount = suggestions.length;
  const findings = await findingSuggestions(db, user.id, followUps);
  const today = toLocalDate(new Date(), user.timezone);
  const activeFollowUps = followUps.filter((f) => f.status === "open" || f.status === "scheduled");
  const nextDue = activeFollowUps.find((f) => f.dueDate !== null);

  const summaries = summarizeLabs(labs);
  const byCategory = new Map<LabCategory, typeof summaries>();
  for (const summary of summaries) {
    const category = getLabDefinition(summary.latest.code)?.category ?? "other";
    byCategory.set(category, [...(byCategory.get(category) ?? []), summary]);
  }
  const pendingReview = documents.filter((d) => d.status === "review" || d.status === "extracting").length;
  const activeGoals = goals.filter((g) => g.status === "active").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">健康</h1>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/health/reports/new"
          className="rounded-xl bg-accent px-3 py-3 text-center text-sm font-medium text-accent-foreground"
        >
          ＋ 上傳健檢報告
        </Link>
        <Link href="/health/labs/new" className="rounded-xl border border-border bg-surface px-3 py-3 text-center text-sm">
          ＋ 手動新增檢驗值
        </Link>
      </div>

      {pendingReview > 0 && (
        <Link href="/health/reports" className="block rounded-xl border border-accent/50 bg-accent/10 p-3 text-sm">
          有 {pendingReview} 份報告正在辨識或等待確認 →
        </Link>
      )}

      <Card title="基本資料" action={<Link href="/health/profile" className="text-sm text-accent">編輯</Link>}>
        {profile ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">性別</dt>
            <dd>{profile.sex ? SEX_LABELS[profile.sex] : "—"}</dd>
            <dt className="text-muted">出生年</dt>
            <dd>{profile.birthYear ?? "—"}</dd>
            <dt className="text-muted">身高</dt>
            <dd>{profile.heightCm ? `${profile.heightCm} cm` : "—"}</dd>
            <dt className="text-muted">過敏</dt>
            <dd>{profile.allergies?.length ? profile.allergies.join("、") : "—"}</dd>
            <dt className="text-muted">慢性病 / 病史</dt>
            <dd>{profile.conditions?.length ? profile.conditions.join("、") : "—"}</dd>
          </dl>
        ) : (
          <p className="text-sm text-muted">尚未填寫。</p>
        )}
      </Card>

      <Card
        title="健康目標"
        action={
          <Link href="/health/goals" className="text-sm text-accent">
            {goals.length ? "查看" : "設定"}
          </Link>
        }
      >
        <p className="text-sm text-muted">{activeGoals ? `進行中 ${activeGoals} 個目標` : "尚未設定目標。"}</p>
        {suggestionCount > 0 && (
          <Link href="/health/goals" className="mt-2 block text-sm text-accent">
            依健檢報告有 {suggestionCount} 個建議目標 ›
          </Link>
        )}
      </Card>

      <Card
        title="追蹤事項"
        action={
          <Link href="/health/follow-ups" className="text-sm text-accent">
            {followUps.length ? "查看" : "新增"}
          </Link>
        }
      >
        {activeFollowUps.length > 0 ? (
          <ul className="space-y-1.5 text-sm">
            {activeFollowUps.slice(0, 3).map((f) => (
              <li key={f.id} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{f.finding}</span>
                <span className={`shrink-0 text-xs ${f.dueDate && f.dueDate < today ? "text-warning" : "text-muted"}`}>
                  {f.dueDate ?? "未安排"}
                </span>
              </li>
            ))}
            {activeFollowUps.length > 3 && <li className="text-xs text-muted">還有 {activeFollowUps.length - 3} 項</li>}
          </ul>
        ) : (
          <p className="text-sm text-muted">沒有待追蹤的事項。</p>
        )}
        {nextDue?.dueDate && nextDue.dueDate < today && <p className="text-xs text-warning">有追蹤事項已過建議日期。</p>}
        {findings.length > 0 && (
          <Link href="/health/follow-ups" className="block text-sm text-accent">
            檢查結果有 {findings.length} 項可能需要追蹤 ›
          </Link>
        )}
      </Card>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">檢驗結果（Baseline）</h2>
          <Link href="/health/reports" className="text-sm text-accent">
            報告（{documents.length}）
          </Link>
        </div>
        {summaries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
            還沒有檢驗資料。上傳健檢報告，AI 會擷取各項數值供你確認。
          </p>
        ) : (
          (Object.keys(LAB_CATEGORIES) as LabCategory[])
            .filter((c) => byCategory.has(c))
            .map((category) => (
              <div key={category} className="rounded-xl border border-border bg-surface">
                <h3 className="border-b border-border px-4 py-2 text-sm text-muted">{LAB_CATEGORIES[category]}</h3>
                <ul className="divide-y divide-border">
                  {byCategory.get(category)!.map(({ key, latest, previous, count }) => {
                    const flag = labFlag(latest);
                    const long = isLongLabText(latest);
                    return (
                      <li key={key}>
                        <Link href={`/health/labs/${encodeURIComponent(key)}`} className="block px-4 py-2.5 hover:bg-background">
                          <span className="flex items-center justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block text-sm break-words">{labDisplayName(latest)}</span>
                              <span className="text-xs text-muted">
                                {latest.measuredAt}
                                {count > 1 && `・共 ${count} 筆`}
                              </span>
                            </span>
                            <span className="max-w-[55%] shrink-0 text-right">
                              {!long && <span className="block text-sm font-medium break-words">{formatLabValue(latest)}</span>}
                              <span className="flex items-center justify-end gap-2">
                                <Trend latest={latest.value} previous={previous?.value} />
                                <span className={`text-xs ${flag.className}`}>{flag.label}</span>
                              </span>
                            </span>
                          </span>
                          {/* 超音波等描述性結果放在名稱下方，避免擠壓名稱 */}
                          {long && <span className="mt-1 line-clamp-3 block text-sm text-muted">{latest.textValue}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
        )}
      </section>

      <p className="text-xs text-muted">檢驗值的高低標示依報告或參考範圍判斷，僅供追蹤，解讀請以醫師判斷為準。</p>
    </div>
  );
}
