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
    <div className="space-y-1">
      <Link href={backHref} className="text-sm text-muted">
        ← {backLabel}
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
    </div>
  );
}
