import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toDateTimeLocalValue } from "@/lib/time";
import { listMedications } from "@/server/medications";
import { saveIntake } from "../../medications/actions";
import { IntakeForm } from "./intake-form";

export const metadata: Metadata = { title: "記錄服用" };

export default async function LogMedicationPage({ searchParams }: PageProps<"/log/medication">) {
  const user = await requireUser();
  const { medication } = await searchParams;
  const meds = (await listMedications(await getDb(), user.id)).filter((m) => m.active);
  return (
    <div className="space-y-6">
      <PageHeader title="記錄服用藥物 / 保健品" />
      <p className="text-sm text-muted">固定時間的品項也可以在今日頁直接打勾；這裡適合記錄臨時吃的、或份量不同的時候。</p>
      <IntakeForm
        action={saveIntake}
        options={meds.map((m) => ({ id: m.id, name: m.name, dose: m.dose, unit: m.unit, asNeeded: m.schedules.length === 0 }))}
        defaultTakenAt={toDateTimeLocalValue(new Date(), user.timezone)}
        defaultMedicationId={typeof medication === "string" ? medication : undefined}
      />
    </div>
  );
}
