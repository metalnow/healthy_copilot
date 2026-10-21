import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { labObservations } from "@/db/schema";
import { LabExtractionSchema } from "@/lib/ai/schemas";
import { requireUser } from "@/lib/auth/dal";
import { getLabDefinition } from "@/lib/labs/catalog";
import { FLAG_CLASSES, FLAG_LABELS, formatLabValue, formatReference } from "@/lib/labs/format";
import { labDraftFromExtraction } from "@/lib/labs/review";
import { getExtraction } from "@/server/ai/extractions";
import { documentMedia, getHealthDocument } from "@/server/health";
import { deleteReport, retryReport } from "../../actions";
import { DOCUMENT_ERROR_MESSAGES, DOCUMENT_STATUS_LABELS } from "../status";
import { LabReviewEditor } from "./lab-review-editor";
import { StatusPoller } from "./status-poller";

export const metadata: Metadata = { title: "健檢報告" };

export default async function ReportPage({ params }: PageProps<"/health/reports/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  const doc = await getHealthDocument(db, user.id, id);
  if (!doc) notFound();

  const media = await documentMedia(db, user.id, doc);
  const extraction =
    doc.status === "review" && doc.extractionId ? await getExtraction(db, user.id, doc.extractionId) : null;
  const parsed = extraction ? LabExtractionSchema.safeParse(extraction.parsedOutput) : null;
  const saved =
    doc.status === "confirmed"
      ? await db
          .select()
          .from(labObservations)
          .where(and(eq(labObservations.sourceDocumentId, doc.id), eq(labObservations.userId, user.id)))
          .orderBy(asc(labObservations.createdAt))
      : [];

  return (
    <div className="space-y-6">
      <PageHeader title={doc.title ?? doc.institution ?? "健檢報告"} backHref="/health/reports" backLabel="健檢報告" />

      <section className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
        <p>
          狀態：
          <span className={doc.status === "failed" ? "text-warning" : ""}>{DOCUMENT_STATUS_LABELS[doc.status]}</span>
        </p>
        {doc.reportDate && <p>檢查日期：{doc.reportDate}</p>}
        <p className="flex flex-wrap gap-x-3 gap-y-1">
          原始檔案：
          {media.map((m, i) => (
            <a key={m.id} href={`/api/media/${m.id}`} target="_blank" rel="noopener" className="text-accent">
              {m.mimeType === "application/pdf" ? "PDF" : `第 ${i + 1} 頁`}
            </a>
          ))}
        </p>
      </section>

      {doc.status === "extracting" && (
        <div role="status" className="flex flex-col items-center gap-3 py-8 text-sm text-muted">
          <StatusPoller />
          <span className="size-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          AI 正在辨識報告，通常需要 10–60 秒，可以先離開此頁。
        </div>
      )}

      {doc.status === "failed" && (
        <div className="space-y-3 rounded-xl border border-warning/40 p-4 text-sm">
          <p className="text-warning">{DOCUMENT_ERROR_MESSAGES[doc.error ?? ""] ?? "辨識失敗，請稍後再試。"}</p>
          <form action={retryReport}>
            <input type="hidden" name="id" value={doc.id} />
            <button type="submit" className="rounded-lg bg-accent px-3 py-2 text-accent-foreground">
              重新辨識
            </button>
          </form>
        </div>
      )}

      {doc.status === "review" &&
        (parsed?.success ? (
          parsed.data.isHealthReport ? (
            <LabReviewEditor
              documentId={doc.id}
              initial={{
                ...labDraftFromExtraction(parsed.data),
                reportDate: doc.reportDate ?? labDraftFromExtraction(parsed.data).reportDate,
              }}
              notes={parsed.data.notes ?? undefined}
            />
          ) : (
            <p className="rounded-xl border border-warning/40 p-4 text-sm text-warning">
              AI 判斷這不是健檢或檢驗報告。可以刪除後重新上傳，或改用手動新增。
            </p>
          )
        ) : (
          <p className="text-sm text-warning">找不到擷取結果，請刪除後重新上傳。</p>
        ))}

      {doc.status === "confirmed" && (
        <section className="space-y-2">
          <h2 className="font-medium">已儲存 {saved.length} 項</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {saved.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block">
                    {row.code === "OTHER" ? row.displayName : (getLabDefinition(row.code)?.name ?? row.displayName)}
                  </span>
                  <span className="text-xs text-muted">{formatReference(row) && `參考 ${formatReference(row)}`}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-medium">{formatLabValue(row)}</span>
                  <span className={`text-xs ${FLAG_CLASSES[row.abnormalFlag ?? "unknown"]}`}>
                    {FLAG_LABELS[row.abnormalFlag ?? "unknown"]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={deleteReport} className="border-t border-border pt-6">
        <input type="hidden" name="id" value={doc.id} />
        <ConfirmButton
          message="確定要刪除這份報告嗎？原始檔案與由它擷取的檢驗值都會一併刪除。"
          className="w-full rounded-lg border border-warning/50 px-4 py-2 text-sm text-warning"
        >
          刪除報告與擷取的檢驗值
        </ConfirmButton>
      </form>
    </div>
  );
}
