import Link from "next/link";

/** 隱私權政策、服務條款等公開頁面（不需登入） */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href="/login" className="text-sm text-accent">
        ← 健康副駕
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">最後更新：{updated}</p>
      </div>
      <div className="space-y-5 text-sm leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_section]:space-y-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}
