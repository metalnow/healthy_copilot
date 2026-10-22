"use client";

import { ChartLine, Clock, HeartPulse, House, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "今日", icon: House },
  { href: "/timeline", label: "時間軸", icon: Clock },
  { href: "/health", label: "健康", icon: HeartPulse },
  { href: "/insights", label: "洞察", icon: ChartLine },
  { href: "/settings", label: "設定", icon: Settings },
];

/** 底部分頁列只在各分頁的首頁顯示；表單等子頁面像 App 的推入畫面一樣隱藏 */
const TAB_ROOTS = new Set([...NAV_ITEMS.map((i) => i.href), "/reports"]);

// 記錄表單與用藥管理都屬於「今日」
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/log") || pathname.startsWith("/medications");
  if (href === "/insights") return pathname.startsWith("/insights") || pathname.startsWith("/reports");
  return pathname.startsWith(href);
}

/** 桌機：頁首的分頁列 */
export function TopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="主選單">
      <ul className="flex gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className="block rounded-md px-3 py-1.5 text-sm text-muted aria-[current=page]:bg-accent/10 aria-[current=page]:font-semibold aria-[current=page]:text-accent"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 手機：固定在底部的分頁列（含安全區域與等高的佔位） */
export function BottomTabBar() {
  const pathname = usePathname();
  if (!TAB_ROOTS.has(pathname)) return null;

  return (
    <>
      <div aria-hidden className="h-16 pb-safe md:hidden" />
      <nav
        aria-label="主選單"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 pb-safe backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className="flex h-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted transition-colors active:opacity-60 aria-[current=page]:font-semibold aria-[current=page]:text-accent"
                >
                  <span
                    className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${active ? "bg-accent/15" : ""}`}
                  >
                    <Icon aria-hidden className="size-5" strokeWidth={active ? 2.4 : 2} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
