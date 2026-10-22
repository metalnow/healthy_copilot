import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "設定" };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">設定</h1>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">Google 帳號</h2>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">名稱</dt>
          <dd>{user.name ?? "—"}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="text-muted">時區</dt>
          <dd>{user.timezone}</dd>
        </dl>
        <form action="/api/auth/logout" method="post" className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
          >
            登出
          </button>
        </form>
      </section>

      <Link
        href="/settings/ai"
        className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:border-accent"
      >
        <span>
          <span className="block font-medium">AI 模型</span>
          <span className="text-sm text-muted">各用途使用的模型、本月用量</span>
        </span>
        <span className="text-muted">›</span>
      </Link>
      <Link
        href="/settings/data"
        className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:border-accent"
      >
        <span>
          <span className="block font-medium">資料與備份</span>
          <span className="text-sm text-muted">Google Drive 加密備份、還原、匯出、刪除帳號</span>
        </span>
        <span className="text-muted">›</span>
      </Link>
    </div>
  );
}
