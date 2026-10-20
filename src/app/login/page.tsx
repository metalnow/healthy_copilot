import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "登入" };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "登入流程已過期，請重新登入。",
  oauth_failed: "Google 登入失敗，請稍後再試。",
  not_allowed: "此 Google 帳號未獲授權使用本系統。",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");

  const { error } = await searchParams;
  const message = typeof error === "string" ? ERROR_MESSAGES[error] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">健康副駕</h1>
        <p className="mt-2 text-sm text-muted">
          以健檢資料為基準，記錄每日行為與量測，定期回顧哪些改變真的對自己有幫助。
        </p>
      </div>

      {message && (
        <p role="alert" className="rounded-lg border border-warning/40 px-3 py-2 text-sm text-warning">
          {message}
        </p>
      )}

      <a
        href="/api/auth/google"
        className="rounded-lg bg-accent px-4 py-3 text-center font-medium text-accent-foreground"
      >
        使用 Google 帳號登入
      </a>

      <p className="text-xs text-muted">
        本系統為個人健康紀錄與分析輔助工具，非醫療診斷系統；所有 AI 推論僅供參考，請以醫師判斷為準。
      </p>
    </main>
  );
}
