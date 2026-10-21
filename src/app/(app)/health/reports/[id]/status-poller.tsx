"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** AI 辨識中時定期重新整理頁面 */
export function StatusPoller({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
