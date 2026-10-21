import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toLocalDate } from "@/lib/time";
import { listHealthDocuments } from "@/server/health";
import { DOCUMENT_STATUS_LABELS } from "./status";

export const metadata: Metadata = { title: "健檢報告" };

export default async function ReportsPage() {
  const user = await requireUser();
  const documents = await listHealthDocuments(await getDb(), user.id);

  return (
    <div className="space-y-6">
      <PageHeader title="健檢報告" backHref="/health" backLabel="健康" />
      <Link
        href="/health/reports/new"
        className="block rounded-lg bg-accent px-4 py-3 text-center font-medium text-accent-foreground"
      >
        ＋ 上傳健檢報告
      </Link>
      {documents.length === 0 ? (
        <p className="text-sm text-muted">還沒有上傳報告。</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link href={`/health/reports/${doc.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {doc.title ?? doc.institution ?? "健檢報告"}
                  </span>
                  <span className="text-xs text-muted">
                    {doc.reportDate ? `檢查日 ${doc.reportDate}` : `上傳於 ${toLocalDate(doc.createdAt, user.timezone)}`}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-xs ${doc.status === "review" || doc.status === "failed" ? "text-warning" : "text-muted"}`}
                >
                  {DOCUMENT_STATUS_LABELS[doc.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
