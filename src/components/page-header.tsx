import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function PageHeader({
  title,
  backHref = "/",
  backLabel = "今日",
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="-ml-2 flex items-center gap-1">
      <Link
        href={backHref}
        aria-label={`返回${backLabel}`}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-border/60"
      >
        <ChevronLeft aria-hidden className="size-6" />
      </Link>
      <h1 className="min-w-0 truncate text-xl font-semibold">{title}</h1>
    </div>
  );
}
