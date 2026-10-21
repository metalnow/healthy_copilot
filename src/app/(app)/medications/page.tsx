import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { MEDICATION_CATEGORY_LABELS, MEDICATION_TIMING_LABELS } from "@/lib/labels";
import { listMedications, type MedicationWithSchedules } from "@/server/medications";
import { toggleMedicationActive } from "./actions";
import { daysText, doseText } from "./schedule-text";

export const metadata: Metadata = { title: "用藥與保健品" };

function MedicationCard({ med }: { med: MedicationWithSchedules }) {
  const details = [
    MEDICATION_CATEGORY_LABELS[med.category],
    doseText(med.dose, med.unit),
    med.timing && med.timing !== "any" ? MEDICATION_TIMING_LABELS[med.timing] : null,
  ].filter(Boolean);

  return (
    <li className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{med.name}</p>
          <p className="text-sm text-muted">{details.join("・")}</p>
          <p className="text-sm text-muted">
            {med.schedules.map((s) => s.localTime).join("、")}
            {med.schedules[0] && `・${daysText(med.schedules[0].daysOfWeek)}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          <Link href={`/medications/${med.id}`} className="text-accent">
            編輯
          </Link>
          <form action={toggleMedicationActive}>
            <input type="hidden" name="id" value={med.id} />
            <input type="hidden" name="active" value={String(!med.active)} />
            <button type="submit" className="text-muted">
              {med.active ? "停用" : "啟用"}
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

export default async function MedicationsPage() {
  const user = await requireUser();
  const meds = await listMedications(await getDb(), user.id);
  const active = meds.filter((m) => m.active);
  const inactive = meds.filter((m) => !m.active);

  return (
    <div className="space-y-6">
      <PageHeader title="用藥與保健品" />
      <Link
        href="/medications/new"
        className="block rounded-lg bg-accent px-4 py-3 text-center font-medium text-accent-foreground"
      >
        ＋ 新增藥物 / 保健品
      </Link>

      {active.length === 0 ? (
        <p className="text-sm text-muted">還沒有設定任何藥物或保健品。</p>
      ) : (
        <ul className="space-y-3">
          {active.map((med) => (
            <MedicationCard key={med.id} med={med} />
          ))}
        </ul>
      )}

      {inactive.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">已停用</h2>
          <ul className="space-y-3 opacity-70">
            {inactive.map((med) => (
              <MedicationCard key={med.id} med={med} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
