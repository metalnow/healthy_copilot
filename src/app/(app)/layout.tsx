import Link from "next/link";
import { BottomTabBar, TopNav } from "@/components/nav";
import { requireUser } from "@/lib/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const initial = (user.name ?? user.email).trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            {/* eslint-disable-next-line @next/next/no-img-element -- 靜態 SVG 圖示 */}
            <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
            健康副駕
          </Link>
          <div className="hidden md:block">
            <TopNav />
          </div>
          <Link
            href="/settings"
            aria-label={`設定（${user.name ?? user.email}）`}
            className="flex size-9 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent active:opacity-60"
          >
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Google 頭像，不經 next/image
              <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full" />
            ) : (
              initial
            )}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-4 pb-6">{children}</main>
      <BottomTabBar />
    </div>
  );
}
