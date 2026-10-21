import { SAFETY_DISCLAIMER, type SafetyAlert } from "@/lib/safety/rules";

const LEVEL_STYLES: Record<SafetyAlert["level"], string> = {
  emergency: "border-red-600 bg-red-600/10",
  urgent: "border-red-600 bg-red-600/10",
  caution: "border-warning bg-warning/10",
};

export function SafetyBanner({ alerts }: { alerts: SafetyAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label="健康提醒" className="space-y-2">
      {alerts.map((alert) => (
        <div key={alert.ruleId} role="alert" className={`rounded-xl border-2 p-4 ${LEVEL_STYLES[alert.level]}`}>
          <p className="font-semibold">⚠ {alert.title}</p>
          <p className="mt-1 text-sm">{alert.message}</p>
        </div>
      ))}
      <p className="text-xs text-muted">{SAFETY_DISCLAIMER}</p>
    </section>
  );
}
