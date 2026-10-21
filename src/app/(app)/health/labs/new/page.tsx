import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/dal";
import { toLocalDate } from "@/lib/time";
import { saveManualLab } from "../../actions";
import { ManualLabForm } from "./manual-lab-form";

export const metadata: Metadata = { title: "新增檢驗值" };

export default async function NewLabPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader title="手動新增檢驗值" backHref="/health" backLabel="健康" />
      <ManualLabForm action={saveManualLab} today={toLocalDate(new Date(), user.timezone)} />
    </div>
  );
}
