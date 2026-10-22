import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { MEAL_TYPE_LABELS } from "@/lib/labels";
import { toDateTimeLocalValue, toLocalDate, toLocalTime } from "@/lib/time";
import { listFoodForDate } from "@/server/food";
import { saveSymptom } from "../lifestyle-actions";
import { SymptomForm } from "./symptom-form";

export const metadata: Metadata = { title: "記錄症狀" };

export default async function SymptomPage() {
  const user = await requireUser();
  const now = new Date();
  const db = await getDb();
  const [today, yesterday] = await Promise.all([
    listFoodForDate(db, user.id, toLocalDate(now, user.timezone)),
    listFoodForDate(db, user.id, toLocalDate(new Date(now.getTime() - 86_400_000), user.timezone)),
  ]);
  const recentFood = [...today, ...yesterday].slice(0, 8).map((f) => ({
    id: f.id,
    label: `${f.localDate.slice(5)} ${toLocalTime(f.occurredAt, user.timezone)} ${MEAL_TYPE_LABELS[f.mealType]}：${f.items.map((i) => i.name).join("、")}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="記錄症狀 / 事件" />
      <SymptomForm action={saveSymptom.bind(null, null)} defaultOccurredAt={toDateTimeLocalValue(now, user.timezone)} recentFood={recentFood} />
    </div>
  );
}
