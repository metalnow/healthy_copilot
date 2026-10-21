import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { fromDateTimeLocalValue, toDateTimeLocalValue, toLocalDate } from "@/lib/time";
import { saveSleep } from "../lifestyle-actions";
import { SleepForm } from "./sleep-form";

export const metadata: Metadata = { title: "記錄睡眠" };

export default async function SleepPage() {
  const user = await requireUser();
  const now = new Date();
  const today = toLocalDate(now, user.timezone);
  // 預設：昨晚 23:00 上床、今天 07:00 起床（若現在還不到 7 點則用現在）
  const yesterday = toLocalDate(new Date(now.getTime() - 86_400_000), user.timezone);
  const sevenAm = fromDateTimeLocalValue(`${today}T07:00`, user.timezone);
  const wake = sevenAm < now ? sevenAm : now;

  return (
    <div className="space-y-6">
      <PageHeader title="記錄睡眠" />
      <SleepForm
        action={saveSleep}
        aiConfigured={Boolean((await getEnv()).OPENROUTER_API_KEY)}
        defaults={{ bedtimeAt: `${yesterday}T23:00`, wakeAt: toDateTimeLocalValue(wake, user.timezone) }}
      />
    </div>
  );
}
