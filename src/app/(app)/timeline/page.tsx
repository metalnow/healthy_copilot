import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "時間軸" };

export default function TimelinePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">時間軸</h1>
      <ComingSoon
        title="所有紀錄的時間軸"
        sprint="Sprint 5"
        items={["量測、飲食、飲水、用藥、睡眠、運動、症狀依時間排列", "AI 擷取資料標示來源與信心值，可直接修正"]}
      />
    </div>
  );
}
