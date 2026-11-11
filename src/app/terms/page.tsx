import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "服務條款" };

export default function TermsPage() {
  return (
    <LegalPage title="服務條款" updated="2026-11-11">
      <p>使用健康副駕，即表示你同意以下條款。</p>

      <section>
        <h2>服務內容</h2>
        <p>健康副駕是個人健康紀錄與分析的輔助工具，協助你記錄每日的量測、飲食、用藥、睡眠與運動，並整理健檢報告與回顧變化。</p>
      </section>

      <section>
        <h2>非醫療用途</h2>
        <ul>
          <li>本服務不是醫療器材，不提供診斷、治療或用藥建議。</li>
          <li>AI 辨識與估算（例如熱量、營養、檢驗值擷取）可能有誤，請自行確認；健康與用藥決定請諮詢醫師或藥師。</li>
          <li>身體出現緊急狀況時，請立即就醫或撥打 119。</li>
        </ul>
      </section>

      <section>
        <h2>你的責任</h2>
        <ul>
          <li>妥善保管你的 Google 帳號，並只上傳你有權使用的資料。</li>
          <li>重要資料請定期備份；本服務提供匯出與 Google Drive 備份功能。</li>
        </ul>
      </section>

      <section>
        <h2>服務提供方式</h2>
        <p>本服務依現況提供，不保證不中斷或完全無誤；功能可能調整，也可能停止提供。停止前會盡量提前通知，讓你匯出資料。</p>
      </section>

      <section>
        <h2>隱私</h2>
        <p>
          資料的收集與使用方式請見<Link href="/privacy" className="text-accent">隱私權政策</Link>。
        </p>
      </section>
    </LegalPage>
  );
}
