import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { AiCapture } from "./ai-capture";

export const metadata: Metadata = { title: "AI 快速記錄" };

const MODES = ["photo", "voice", "text"] as const;

export default async function AiLogPage({ searchParams }: PageProps<"/log/ai">) {
  await requireUser();
  const env = await getEnv();
  const { mode } = await searchParams;
  const initialMode = MODES.find((m) => m === mode) ?? "photo";

  return (
    <div className="space-y-6">
      <PageHeader title="AI 快速記錄" />
      <AiCapture configured={Boolean(env.OPENROUTER_API_KEY)} initialMode={initialMode} />
    </div>
  );
}
