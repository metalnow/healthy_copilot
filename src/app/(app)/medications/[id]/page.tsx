import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/form";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { getMedication } from "@/server/medications";
import { removeMedication, saveMedication } from "../actions";
import { MedicationForm } from "../medication-form";

export const metadata: Metadata = { title: "編輯藥物" };

export default async function EditMedicationPage({ params }: PageProps<"/medications/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const med = await getMedication(await getDb(), user.id, id);
  if (!med) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`編輯 ${med.name}`} backHref="/medications" backLabel="用藥與保健品" />
      <MedicationForm
        action={saveMedication.bind(null, med.id)}
        defaults={{
          name: med.name,
          category: med.category,
          dose: med.dose,
          unit: med.unit,
          timing: med.timing,
          times: med.schedules.map((s) => s.localTime),
          daysOfWeek: med.schedules[0]?.daysOfWeek ?? null,
        }}
      />

      <form action={removeMedication} className="border-t border-border pt-6">
        <input type="hidden" name="id" value={med.id} />
        <ConfirmButton
          message={`確定要刪除「${med.name}」嗎？所有服用紀錄也會一併刪除。只是暫停服用的話，請改用「停用」。`}
          className="w-full rounded-lg border border-warning/50 px-4 py-2 text-sm text-warning"
        >
          刪除此藥物與所有服用紀錄
        </ConfirmButton>
      </form>
    </div>
  );
}
