import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "報告" };

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">報告</h1>
      <ComingSoon
        title="Doctor Summary"
        sprint="P1"
        items={["30 / 90 / 180 天摘要", "匯出 PDF / JSON / CSV"]}
      />
    </div>
  );
}
