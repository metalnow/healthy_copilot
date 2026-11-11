import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "隱私權政策" };

export default function PrivacyPage() {
  return (
    <LegalPage title="隱私權政策" updated="2026-11-11">
      <p>健康副駕是個人健康紀錄與分析的輔助工具。本頁說明我們收集哪些資料、如何使用與保護，以及你可以怎麼管理自己的資料。</p>

      <section>
        <h2>收集的資料</h2>
        <ul>
          <li>Google 帳號的基本資料（姓名、Email、大頭貼），只用於登入與辨識你的帳號。</li>
          <li>你自行輸入或上傳的健康資料：量測、飲食、飲料、用藥、睡眠、運動、症狀、健檢報告、照片、截圖與語音。</li>
          <li>操作紀錄（稽核紀錄）只記錄動作與對象，不包含健康內容。</li>
        </ul>
      </section>

      <section>
        <h2>資料的使用</h2>
        <ul>
          <li>只用於提供本服務的功能：記錄、統計、回顧、提醒與 AI 辨識。</li>
          <li>不販售、不出租、不分享給第三方做行銷或廣告，也不用於訓練任何 AI 模型。</li>
        </ul>
      </section>

      <section>
        <h2>AI 處理</h2>
        <ul>
          <li>照片辨識、報告擷取、語音與文字解析透過 OpenRouter 呼叫 AI 模型，只使用不保留資料（Zero Data Retention）的服務端點，並要求不收集資料。</li>
          <li>送給 AI 的內容不包含你的姓名、Email 等身分資料；健檢報告上傳前可塗黑或自動移除身分欄位。</li>
          <li>AI 的結果都會先讓你確認，確認後才會存入紀錄。</li>
        </ul>
      </section>

      <section>
        <h2>儲存與保護</h2>
        <ul>
          <li>資料存放在 Cloudflare（D1 資料庫與 R2 檔案儲存），只有登入的本人能存取自己的資料。</li>
          <li>Google 授權憑證與雲端備份以每位使用者專屬的金鑰加密（AES-256-GCM）。</li>
        </ul>
      </section>

      <section>
        <h2>Google 使用者資料</h2>
        <ul>
          <li>登入只要求 openid、email、profile 權限。</li>
          <li>Google Drive 備份只要求 drive.file 權限：只能建立與存取本服務自己建立的備份檔，無法讀取你 Drive 裡的其他檔案。</li>
          <li>從 Google API 取得的資料只用於登入與備份，不會轉移給第三方，也不用於廣告。本服務使用 Google API 取得的資料，遵守 Google API Services User Data Policy，包括其中的 Limited Use 規定。</li>
          <li>你可以隨時在「設定 → 資料與備份」中斷 Google Drive 連結，或到 Google 帳戶的「第三方存取權」撤銷授權。</li>
        </ul>
      </section>

      <section>
        <h2>你的權利</h2>
        <ul>
          <li>匯出：在「設定 → 資料與備份」可以下載所有資料。</li>
          <li>刪除：同一頁可以刪除帳號，所有資料與上傳的檔案都會一併刪除。</li>
        </ul>
      </section>

      <section>
        <h2>醫療聲明</h2>
        <p>本服務不是醫療器材，也不提供診斷或治療建議；所有 AI 推論與建議僅供參考，請以醫師判斷為準。</p>
      </section>

      <section>
        <h2>政策更新</h2>
        <p>本政策若有變更，會更新本頁並修改上方的更新日期。</p>
      </section>
    </LegalPage>
  );
}
