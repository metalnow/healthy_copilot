import { ConfirmButton } from "@/components/form";
import type { TimelineItem } from "@/server/timeline";
import { deleteEntry } from "../actions";

export function EntryList({ items }: { items: TimelineItem[] }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3 px-4 py-3">
          <span className="w-12 shrink-0 text-sm tabular-nums text-muted">{item.time ?? "整天"}</span>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium ${item.emphasis ? "text-warning" : ""}`}>
              {item.title}
              {item.ai && (
                <span className="ml-2 rounded bg-accent/10 px-1.5 py-0.5 text-xs font-normal text-accent">AI</span>
              )}
            </p>
            <p className="line-clamp-2 text-sm text-muted">{item.detail}</p>
          </div>
          {item.deleteKind && (
            <form action={deleteEntry}>
              <input type="hidden" name="kind" value={item.deleteKind} />
              <input type="hidden" name="id" value={item.id} />
              <ConfirmButton
                message={`確定要刪除這筆${item.title}紀錄嗎？`}
                aria-label={`刪除 ${item.time ?? item.localDate} 的${item.title}紀錄`}
                className="px-2 py-1 text-sm text-muted"
              >
                刪除
              </ConfirmButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
