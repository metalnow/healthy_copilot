import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "設定" };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">設定</h1>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="font-medium">Google 帳號</h2>
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

      <ComingSoon title="AI 模型設定" sprint="Sprint 3" items={["各任務的 OpenRouter 模型配置"]} />
      <ComingSoon
        title="Google Drive 備份"
        sprint="Sprint 7"
        items={["加密備份、每週自動備份、還原"]}
      />
      <ComingSoon title="資料與隱私" sprint="Sprint 7" items={["匯出全部資料", "刪除帳號與所有資料"]} />
    </div>
  );
}
