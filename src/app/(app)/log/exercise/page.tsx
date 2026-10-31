import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toDateTimeLocalValue } from "@/lib/time";
import { saveExercise } from "../lifestyle-actions";
import { ExerciseForm } from "./exercise-form";

export const metadata: Metadata = { title: "記錄運動" };

export default async function ExercisePage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader title="記錄運動" />
      <ExerciseForm
        action={saveExercise.bind(null, null)}
        defaultStartedAt={toDateTimeLocalValue(new Date(), user.timezone)}
        aiConfigured={Boolean((await getEnv()).OPENROUTER_API_KEY)}
      />
    </div>
  );
}
