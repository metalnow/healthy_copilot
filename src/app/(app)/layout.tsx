import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="pb-16 md:pb-0">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-2">
          <span className="font-semibold">健康副駕</span>
          <span className="truncate text-sm text-muted">{user.name ?? user.email}</span>
        </div>
        <div className="mx-auto hidden max-w-3xl px-2 pb-2 md:block">
          <Nav />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <div className="md:hidden">
        <Nav />
      </div>
    </div>
  );
}
