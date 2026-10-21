import type { ReviewOutput } from "@/lib/ai/schemas";

const PATTERN_LABELS = { observation: "觀察", correlation: "相關", hypothesis: "假設" } as const;

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="list-inside list-disc space-y-1 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function ReviewView({ output }: { output: ReviewOutput }) {
  return (
    <div className="space-y-4">
      <p className="font-medium">{output.headline}</p>
      <List title="做得好" items={output.wins} />
      <List title="值得留意" items={output.concerns} />
      {output.patterns.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-sm font-medium">可能的模式</h3>
          <ul className="space-y-1 text-sm">
            {output.patterns.map((p) => (
              <li key={p.text} className="flex gap-2">
                <span className="shrink-0 rounded bg-border px-1.5 py-0.5 text-xs">{PATTERN_LABELS[p.kind]}</span>
                {p.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      {output.nextFocus.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">下一期重點</h3>
          <ol className="space-y-2">
            {output.nextFocus.map((f, i) => (
              <li key={f.action} className="rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
                <span className="font-medium">
                  {i + 1}. {f.action}
                </span>
                <span className="block text-muted">{f.why}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <List title="可與醫師討論是否複檢" items={output.labFollowUp} />
      <List title="資料不足的部分" items={output.dataGaps} />
      <p className="text-xs text-muted">
        AI 回顧依你的紀錄彙總產生，「相關」不代表因果，也不能取代醫師的判斷。
      </p>
    </div>
  );
}
