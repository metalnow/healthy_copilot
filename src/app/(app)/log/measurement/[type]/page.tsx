import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { formatObservation } from "@/lib/format";
import { OBSERVATION_LABELS } from "@/lib/labels";
import { OBSERVATION_TYPES, type ObservationType } from "@/lib/schemas/observation";
import { toDateTimeLocalValue, toLocalDate } from "@/lib/time";
import { latestObservations } from "@/server/observations";
import { saveMeasurement } from "../../../actions";
import { MeasurementForm } from "./measurement-form";

function isObservationType(value: string): value is ObservationType {
  return (OBSERVATION_TYPES as readonly string[]).includes(value);
}

export async function generateMetadata({
  params,
}: PageProps<"/log/measurement/[type]">): Promise<Metadata> {
  const { type } = await params;
  return { title: isObservationType(type) ? `記錄${OBSERVATION_LABELS[type]}` : "記錄" };
}

export default async function MeasurementPage({ params }: PageProps<"/log/measurement/[type]">) {
  const { type } = await params;
  if (!isObservationType(type)) notFound();

  const user = await requireUser();
  const latest = (await latestObservations(await getDb(), user.id))[type];

  return (
    <div className="space-y-6">
      <PageHeader title={`記錄${OBSERVATION_LABELS[type]}`} />
      {latest && (
        <p className="text-sm text-muted">
          上次：{formatObservation(type, latest.values)}（{toLocalDate(latest.occurredAt, user.timezone)}）
        </p>
      )}
      <MeasurementForm
        type={type}
        action={saveMeasurement.bind(null, type)}
        defaultOccurredAt={toDateTimeLocalValue(new Date(), user.timezone)}
      />
    </div>
  );
}
