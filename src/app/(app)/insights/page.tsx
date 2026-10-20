import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "洞察" };

export default function InsightsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">洞察</h1>
      <ComingSoon
        title="AI 回顧"
        sprint="Sprint 6"
        items={["每週回顧：Wins / Concerns / Possible Patterns / Next Week Focus"]}
      />
      <ComingSoon
        title="進階分析"
        sprint="P1"
        items={["每月 / 每季回顧", "Correlation Explorer", "N-of-1 Experiment"]}
      />
    </div>
  );
}
