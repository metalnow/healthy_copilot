type Props = {
  title: string;
  sprint: string;
  items: string[];
};

/** 尚未實作模組的佔位區塊 */
export function ComingSoon({ title, sprint, items }: Props) {
  return (
    <section className="rounded-xl border border-dashed border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        <span className="text-xs text-muted">{sprint}</span>
      </div>
      <ul className="mt-2 list-inside list-disc text-sm text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
