import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { saveMedication } from "../actions";
import { MedicationForm } from "../medication-form";

export const metadata: Metadata = { title: "新增藥物" };

export default async function NewMedicationPage() {
  await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader title="新增藥物 / 保健品" backHref="/medications" backLabel="用藥與保健品" />
      <MedicationForm action={saveMedication.bind(null, null)} aiImport={Boolean((await getEnv()).OPENROUTER_API_KEY)} />
    </div>
  );
}
