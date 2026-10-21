import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/dal";
import { toLocalDate } from "@/lib/time";
import { saveActivity } from "../lifestyle-actions";
import { ActivityForm } from "./activity-form";

export const metadata: Metadata = { title: "記錄步數" };

export default async function ActivityPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader title="記錄步數 / 活動量" />
      <ActivityForm action={saveActivity} today={toLocalDate(new Date(), user.timezone)} />
    </div>
  );
}
