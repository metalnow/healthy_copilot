import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "健康" };

export default function HealthPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">健康</h1>
      <ComingSoon
        title="Health Baseline"
        sprint="Sprint 4"
        items={["健檢報告上傳（PDF / 圖片）與 AI 擷取", "檢驗數值確認與歷年趨勢", "過敏原", "健康目標"]}
      />
    </div>
  );
}
