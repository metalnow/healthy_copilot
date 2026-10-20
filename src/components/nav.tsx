"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "今日" },
  { href: "/timeline", label: "時間軸" },
  { href: "/health", label: "健康" },
  { href: "/insights", label: "洞察" },
  { href: "/reports", label: "報告" },
  { href: "/settings", label: "設定" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      aria-label="主選單"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface md:static md:border-t-0"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-6 md:flex md:gap-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className="block px-2 py-3 text-center text-sm text-muted aria-[current=page]:font-semibold aria-[current=page]:text-accent md:rounded-md md:px-3 md:py-1.5"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
