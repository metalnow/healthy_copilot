import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "上傳健檢報告" };

export default async function NewReportPage() {
  const user = await requireUser();
  const env = await getEnv();
  return (
    <div className="space-y-6">
      <PageHeader title="上傳健檢報告" backHref="/health/reports" backLabel="健檢報告" />
      <UploadForm configured={Boolean(env.OPENROUTER_API_KEY)} ownerNames={user.name ? [user.name] : []} />
    </div>
  );
}
