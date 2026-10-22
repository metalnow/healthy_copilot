import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { MEAL_TYPE_LABELS } from "@/lib/labels";
import { toDateTimeLocalValue, toLocalTime } from "@/lib/time";
import { listFoodForDate } from "@/server/food";
import { addDays } from "@/server/insights";
import { getSymptom } from "@/server/lifestyle";
import { saveSymptom } from "../../lifestyle-actions";
import { SymptomForm } from "../symptom-form";

export const metadata: Metadata = { title: "修改症狀" };

export default async function EditSymptomPage({ params }: PageProps<"/log/symptom/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const db = await getDb();
  const symptom = await getSymptom(db, user.id, id);
  if (!symptom) notFound();

  // 可勾選的飲食：症狀當天與前一天
  const [sameDay, dayBefore] = await Promise.all([
    listFoodForDate(db, user.id, symptom.localDate),
    listFoodForDate(db, user.id, addDays(symptom.localDate, -1)),
  ]);
  const recentFood = [...sameDay, ...dayBefore].slice(0, 8).map((f) => ({
    id: f.id,
    label: `${f.localDate.slice(5)} ${toLocalTime(f.occurredAt, user.timezone)} ${MEAL_TYPE_LABELS[f.mealType]}：${f.items.map((i) => i.name).join("、")}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="修改症狀 / 事件" backHref="/timeline" backLabel="時間軸" />
      <SymptomForm
        action={saveSymptom.bind(null, symptom.id)}
        defaultOccurredAt={toDateTimeLocalValue(new Date(symptom.occurredAt), user.timezone)}
        recentFood={recentFood}
        defaults={{
          type: symptom.type,
          severity: symptom.severity,
          durationMin: symptom.durationMin ?? undefined,
          note: symptom.note ?? undefined,
          relatedFoodEventIds: symptom.relatedFoodEventIds ?? [],
        }}
      />
    </div>
  );
}
