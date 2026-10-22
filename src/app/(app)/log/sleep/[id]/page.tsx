import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toDateTimeLocalValue } from "@/lib/time";
import { getSleep } from "@/server/lifestyle";
import { saveSleep } from "../../lifestyle-actions";
import { SleepForm } from "../sleep-form";

export const metadata: Metadata = { title: "修改睡眠" };

export default async function EditSleepPage({ params }: PageProps<"/log/sleep/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sleep = await getSleep(await getDb(), user.id, id);
  if (!sleep) notFound();
  const local = (iso: string | null) => (iso ? toDateTimeLocalValue(new Date(iso), user.timezone) : "");
  const num = (n: number | null) => n ?? undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="修改睡眠" backHref="/timeline" backLabel="時間軸" />
      <SleepForm
        action={saveSleep.bind(null, sleep.id)}
        aiConfigured={false}
        defaults={{
          bedtimeAt: local(sleep.bedtimeAt),
          sleepStartAt: local(sleep.sleepStartAt),
          wakeAt: local(sleep.wakeAt),
          awakenings: num(sleep.awakenings),
          quality: num(sleep.quality),
          details: {
            totalSleepMin: num(sleep.totalSleepMin),
            awakeMin: num(sleep.awakeMin),
            deepMin: num(sleep.deepMin),
            remMin: num(sleep.remMin),
            lightMin: num(sleep.lightMin),
            avgHeartRate: num(sleep.avgHeartRate),
            hrvMs: num(sleep.hrvMs),
          },
        }}
      />
    </div>
  );
}
