import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toLocalDate } from "@/lib/time";
import { getActivity } from "@/server/lifestyle";
import { saveActivity } from "../../lifestyle-actions";
import { ActivityForm } from "../activity-form";

export const metadata: Metadata = { title: "修改步數" };

export default async function EditActivityPage({ params }: PageProps<"/log/activity/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const activity = await getActivity(await getDb(), user.id, id);
  if (!activity) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="修改步數 / 活動量" backHref="/timeline" backLabel="時間軸" />
      <ActivityForm
        action={saveActivity.bind(null, activity.id)}
        today={toLocalDate(new Date(), user.timezone)}
        defaults={{
          localDate: activity.localDate,
          steps: activity.steps ?? undefined,
          distanceKm: activity.distanceM !== null ? activity.distanceM / 1000 : undefined,
          activeMinutes: activity.activeMinutes ?? undefined,
          totalKcal: activity.totalKcal ?? undefined,
        }}
      />
    </div>
  );
}
