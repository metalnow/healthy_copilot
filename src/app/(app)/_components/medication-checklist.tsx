import Link from "next/link";
import { MEDICATION_STATUS_LABELS, MEDICATION_TIMING_LABELS } from "@/lib/labels";
import { TIME_SLOT_LABELS, TIME_SLOTS, type ChecklistItem } from "@/lib/medication/checklist";
import { toLocalTime } from "@/lib/time";
import { updateMedicationCheck } from "../actions";
import { removeIntake } from "../medications/actions";
import { doseText } from "../medications/schedule-text";

function CheckButton({
  item,
  localDate,
  action,
  label,
  className,
}: {
  item: ChecklistItem;
  localDate: string;
  action: "take" | "skip" | "clear";
  label: string;
  className: string;
}) {
  return (
    <form action={updateMedicationCheck}>
      <input type="hidden" name="scheduleId" value={item.scheduleId} />
      <input type="hidden" name="localDate" value={localDate} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" className={className} aria-label={`${item.name} ${label}`}>
        {label}
      </button>
    </form>
  );
}

type Intake = { id: string; name: string; unit: string | null; dose: number | null; takenAt: string | null };

export function MedicationChecklist({
  items,
  intakes,
  localDate,
  timeZone,
}: {
  items: ChecklistItem[];
  /** 排程以外另外記錄的服用 */
  intakes: Intake[];
  localDate: string;
  timeZone: string;
}) {
  return (
    <section aria-labelledby="medication-heading" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="medication-heading" className="font-semibold">
          今日用藥
        </h2>
        <div className="flex items-baseline gap-4 text-sm">
          <Link href="/log/medication" className="font-medium text-accent">
            ＋ 記錄服用
          </Link>
          <Link href="/medications" className="text-accent">
            管理
          </Link>
        </div>
      </div>

      {items.length === 0 && intakes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
          今天沒有排定的項目。吃了藥或保健品，可以按「記錄服用」。
        </p>
      ) : (
        <>
          {TIME_SLOTS.map((slot) => {
            const slotItems = items.filter((i) => i.slot === slot);
            if (slotItems.length === 0) return null;
            return (
              <div key={slot} className="rounded-xl border border-border bg-surface">
                <h3 className="border-b border-border px-4 py-2 text-sm text-muted">{TIME_SLOT_LABELS[slot]}</h3>
                <ul className="divide-y divide-border">
                  {slotItems.map((item) => {
                    const done = item.event !== null;
                    const detail = [
                      item.localTime,
                      doseText(item.dose, item.unit),
                      item.timing && item.timing !== "any" ? MEDICATION_TIMING_LABELS[item.timing] : null,
                    ]
                      .filter(Boolean)
                      .join("・");
                    return (
                      <li key={item.scheduleId} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className={done ? "text-muted line-through decoration-1" : "font-medium"}>
                            {item.event?.status === "skipped" ? "－" : done ? "✓" : "☐"} {item.name}
                          </p>
                          <p className="text-xs text-muted">
                            {detail}
                            {item.event &&
                              `・${MEDICATION_STATUS_LABELS[item.event.status]}${
                                item.event.takenAt ? ` ${toLocalTime(item.event.takenAt, timeZone)}` : ""
                              }`}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2 text-sm">
                          {done ? (
                            <CheckButton item={item} localDate={localDate} action="clear" label="復原" className="px-2 py-1 text-muted" />
                          ) : (
                            <>
                              <CheckButton item={item} localDate={localDate} action="skip" label="略過" className="px-2 py-1 text-muted" />
                              <CheckButton
                                item={item}
                                localDate={localDate}
                                action="take"
                                label="服用"
                                className="rounded-full bg-accent px-3 py-1 text-accent-foreground"
                              />
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {intakes.length > 0 && (
            <div className="rounded-xl border border-border bg-surface">
              <h3 className="border-b border-border px-4 py-2 text-sm text-muted">另外記錄的服用</h3>
              <ul className="divide-y divide-border">
                {intakes.map((intake) => (
                  <li key={intake.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">✓ {intake.name}</p>
                      <p className="text-xs text-muted">
                        {[intake.takenAt && toLocalTime(intake.takenAt, timeZone), intake.dose !== null && doseText(intake.dose, intake.unit)]
                          .filter(Boolean)
                          .join("・")}
                      </p>
                    </div>
                    <form action={removeIntake}>
                      <input type="hidden" name="id" value={intake.id} />
                      <button type="submit" className="px-2 py-1 text-sm text-muted" aria-label={`刪除 ${intake.name} 的服用紀錄`}>
                        刪除
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
