import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { OBSERVATION_LABELS } from "@/lib/labels";
import { OBSERVATION_TYPES, type ObservationType } from "@/lib/schemas/observation";
import { toDateTimeLocalValue } from "@/lib/time";
import { getObservation } from "@/server/observations";
import { saveMeasurement } from "../../../../actions";
import { MeasurementForm } from "../measurement-form";

export const metadata: Metadata = { title: "修改量測" };

export default async function EditMeasurementPage({ params }: PageProps<"/log/measurement/[type]/[id]">) {
  const { type, id } = await params;
  if (!(OBSERVATION_TYPES as readonly string[]).includes(type)) notFound();
  const user = await requireUser();
  const observation = await getObservation(await getDb(), user.id, id);
  if (!observation || observation.type !== type) notFound();
  const observationType = type as ObservationType;

  return (
    <div className="space-y-6">
      <PageHeader title={`修改${OBSERVATION_LABELS[observationType]}`} backHref="/timeline" backLabel="時間軸" />
      <MeasurementForm
        type={observationType}
        action={saveMeasurement.bind(null, observationType, observation.id)}
        defaultOccurredAt={toDateTimeLocalValue(new Date(observation.occurredAt), user.timezone)}
        defaults={{
          values: observation.values,
          note: observation.note ?? undefined,
          context: observationType === "blood_pressure" ? (observation.context ?? undefined) : undefined,
        }}
      />
    </div>
  );
}
