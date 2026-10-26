import { checkNutrients, type Advice } from "@/lib/health-advice";
import { formatNutrient, NUTRIENTS, type NutrientValues } from "@/lib/nutrition";

const SECTIONS = [
  { key: "diet", label: "飲食調整" },
  { key: "daily", label: "生活習慣" },
  { key: "watch", label: "要注意" },
] as const;

/** 改善行動（可收合）；有近期飲食紀錄時，列出超過或不足建議量的營養素 */
export function AdviceList({
  advice,
  intake,
  open = false,
}: {
  advice: Advice;
  /** 近期每日平均攝取；沒有紀錄時省略 */
  intake?: { days: number; averages: NutrientValues };
  open?: boolean;
}) {
  const issues = intake && intake.days > 0 ? checkNutrients(advice.nutrients ?? [], intake.averages) : [];
  return (
    <details open={open} className="group rounded-xl bg-background/60 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-accent">可以怎麼做：{advice.topic}</summary>
      <div className="mt-2 space-y-2">
        {issues.length > 0 && (
          <div className="rounded-lg border border-warning/40 p-2 text-xs">
            <p className="font-medium text-warning">你近 {intake!.days} 天有紀錄的日子平均（估算）：</p>
            <ul className="mt-1 space-y-0.5">
              {issues.map((issue) => {
                const def = NUTRIENTS.find((n) => n.key === issue.key)!;
                return (
                  <li key={issue.key}>
                    {def.label} {formatNutrient(issue.key, issue.value)} {def.unit}・建議{issue.note}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {SECTIONS.filter((s) => advice[s.key].length > 0).map((section) => (
          <div key={section.key}>
            <p className="text-xs font-medium text-muted">{section.label}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {advice[section.key].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-muted">一般衛教原則，不含用藥建議；有慢性病或特殊狀況請依醫師與營養師指示。</p>
      </div>
    </details>
  );
}
