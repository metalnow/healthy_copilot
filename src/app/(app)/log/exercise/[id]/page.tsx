import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toDateTimeLocalValue } from "@/lib/time";
import { getExercise } from "@/server/lifestyle";
import { saveExercise } from "../../lifestyle-actions";
import { ExerciseForm } from "../exercise-form";

export const metadata: Metadata = { title: "修改運動" };

export default async function EditExercisePage({ params }: PageProps<"/log/exercise/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const exercise = await getExercise(await getDb(), user.id, id);
  if (!exercise) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="修改運動" backHref="/timeline" backLabel="時間軸" />
      <ExerciseForm
        action={saveExercise.bind(null, exercise.id)}
        defaultStartedAt={toDateTimeLocalValue(new Date(exercise.occurredAt), user.timezone)}
        defaults={{
          type: exercise.type,
          durationMin: exercise.durationMin,
          rpe: exercise.rpe ?? undefined,
          intensity: exercise.intensity ?? undefined,
          afterMeal: exercise.afterMeal ?? undefined,
          note: exercise.note ?? undefined,
        }}
      />
    </div>
  );
}
