import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { ReviewOutputSchema } from "@/lib/ai/schemas";
import { requireUser } from "@/lib/auth/dal";
import { getReview } from "@/server/ai/reviews";
import { StatusPoller } from "@/components/status-poller";
import { generateReview } from "../../actions";
import { ReviewView } from "../../review-view";

export const metadata: Metadata = { title: "AI 回顧" };

export default async function ReviewPage({ params }: PageProps<"/insights/reviews/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const review = await getReview(await getDb(), user.id, id);
  if (!review) notFound();
  const output = review.output ? ReviewOutputSchema.safeParse(review.output) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${review.period === "weekly" ? "週" : "月"}回顧`}
        backHref="/insights"
        backLabel="洞察"
      />
      <p className="text-sm text-muted">
        {review.periodStart} – {review.periodEnd}
      </p>

      {review.status === "pending" && (
        <div role="status" className="flex flex-col items-center gap-3 py-8 text-sm text-muted">
          <StatusPoller />
          <span className="size-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          AI 正在整理回顧，通常需要 10–60 秒。
        </div>
      )}

      {review.status === "failed" && (
        <form action={generateReview} className="space-y-3 rounded-xl border border-warning/40 p-4 text-sm">
          <p className="text-warning">產生回顧失敗（{review.error}），請稍後再試。</p>
          <input type="hidden" name="period" value={review.period} />
          <button type="submit" className="rounded-lg bg-accent px-3 py-2 text-accent-foreground">
            重新產生
          </button>
        </form>
      )}

      {review.status === "succeeded" && output?.success && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <ReviewView output={output.data} />
        </div>
      )}
    </div>
  );
}
