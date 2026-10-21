# 開發計劃（修正版）

原始規格見 [spec-v1.md](./spec-v1.md)。本文件記錄對規格的修正與已確定的技術決策；兩者衝突時以本文件為準。

## 已確定的決策

| 項目 | 決策 |
|---|---|
| 部署 | Cloudflare Workers（`@opennextjs/cloudflare`） |
| 資料庫 | Cloudflare D1（SQLite）+ Drizzle ORM；取代規格中的 PostgreSQL |
| 物件儲存 | Cloudflare R2 |
| 背景工作 | Cron Triggers（每小時 dispatcher）+ Queues；多步驟流程（備份）用 Workflows |
| 登入 | 自建 Google OIDC（`arctic`）+ D1 server-side session；登入只要求 `openid email profile` |
| 加密 | Envelope encryption：Worker secret 主金鑰包裝每位使用者的 DEK，AES-256-GCM（Web Crypto） |
| 介面語言 | 只做繁體中文 |
| 使用範圍 | 個人使用；可用 `ALLOWED_EMAILS` 限制可登入帳號 |

## 對規格的修正

1. **補齊資料結構**：所有事件表都有 `user_id`；補上 `FoodItem`、`NutritionEstimate`、`SleepSession`、`DrinkEvent`、`ActivityDaily` 等定義。見 `src/lib/schemas/` 與 `src/db/schema.ts`。
2. **時區**：每筆事件存 UTC 時間、使用者當地日期（`local_date`）與 IANA 時區。所有每日 / 每週彙總以 `local_date` 為準。
3. **飲料也有營養估算**：`drink_events.nutrition` 與食物相同，標記為 Estimated。
4. **用藥排程**：`medication_schedules` 為「每天固定時刻 + 可選星期幾」，取代規格中的自由字串。
5. **AI 擷取與確認資料分離**：`ai_extractions` 保存模型原始輸出，確認後的資料寫入各領域表並以 `extraction_id` 關聯；原始檔案存 R2，永不覆寫。
6. **稽核紀錄**：`audit_logs` 只記錄動作與對象，不記錄健康內容。
7. **Health Report PDF**：Workers 無法在伺服器端把 PDF 轉圖片。改為瀏覽器端用 pdf.js 轉成每頁圖片後上傳，原始 PDF 同樣存 R2；或直接送支援 PDF 的模型。
8. **照片在瀏覽器端先縮圖**再上傳，減少流量與 AI token。
9. **Drive 還原**：`drive.file` 只看得到同一 OAuth client 建立的檔案；換部署或 client 時需用 Google Picker 讓使用者選擇備份檔。
10. **備份金鑰**：主金鑰只在伺服器時，伺服器資料遺失會讓 Drive 備份無法解密。Sprint 7 需同時提供使用者自行保管的復原金鑰（或可匯出金鑰）。

## Sprint 規劃

| Sprint | 內容 | 狀態 |
|---|---|---|
| 0 Foundation | Next.js + OpenNext + Wrangler、D1 schema 與 migration、Zod schema、時區工具、加密工具、稽核紀錄、CI | ✅ |
| 1 Auth & Shell | Google 登入、session、使用者初始化（DEK、預設設定）、主導覽與頁面骨架 | ✅（基本版） |
| 2 Daily Tracking | 體重 / 血壓 / 心率 / 腰圍、文字輸入飲食與飲水、用藥定義與打勾、**Safety Rule：血壓閾值** | ✅ |
| 3 AI Gateway | OpenRouter、Model Profile 設定、Zod 驗證與重試、信心值 / 確認流程、食物照片、語音（先做 spike 驗證 OpenRouter 音訊輸入） | ✅ |
| 4 Health Records | 報告上傳（pdf.js 轉圖）、檢驗項目擷取、代碼與單位正規化、Baseline 時間軸、健康目標 | |
| 5 Lifestyle | 睡眠（含截圖）、步數、運動、症狀（**Safety Rule：胸痛、呼吸困難、暈厥、疑似過敏性休克**）、時間軸頁 | |
| 6 Insight | 彙總服務、週回顧、趨勢圖、Today Focus、AI 洞察 | |
| 7 Google Drive | Drive 授權、加密備份、手動 / 自動備份、還原（含 Picker）、資料匯出與刪除 | |

## Sprint 2 實作備註

- 量測：血壓可記錄情境（姿勢、手臂、休息時間、早餐前）；填了脈搏會另存一筆心率。
- 危險訊號（`src/lib/safety/rules.ts`）：依「今天最新一筆」血壓 / 心率判斷，固定文案顯示在「今日」頁頂端。
  - 血壓 ≥ 180/120：urgent，提示 119 / 急診的症狀條件
  - 血壓 ≥ 160/100、收縮壓 < 90、心率 > 120 或 < 40：caution
- 飲食：文字輸入多個品項、最近吃過的快速選取、複製同餐別上一次。營養估算留待 Sprint 3。
- 飲水：水量計入每日飲水；酒精飲料依容量與酒精濃度換算酒精克數（密度 0.789）。
- 用藥：每天固定時刻 + 可選星期；「今日」頁可服用 / 略過 / 復原；超過預定時間 2 小時服用記為「延遲」。
  編輯時時刻不變的排程保留原 id，已打勾的紀錄不受影響。
- 尚未支援：臨時（非排程）服藥、藥物庫存提醒。

## Sprint 3 實作備註

- 隱私：所有 OpenRouter 請求帶 `provider: { zdr: true, data_collection: "deny" }`，只走零資料保留端點；
  請求內容不含姓名、Email 或帳號資訊。設定頁更換模型時會檢查該模型是否有 ZDR 端點。
- 語音：OpenRouter 已有 `/audio/transcriptions` 端點，可直接接受瀏覽器錄音（webm / m4a / ogg），
  不需要 Workers AI 備案。流程為「錄音 → Whisper 轉文字 → fast 模型結構化 → 使用者確認」。
- 結構化輸出：`response_format: json_schema`（strict）+ `require_parameters`，再以 Zod 驗證；
  不符時把錯誤回饋給模型重試一次。AI schema 全欄位必填、無值用 null，提高各供應商相容性。
- 確認流程：AI 結果先存 `ai_extractions`（status=succeeded），轉成可編輯草稿；使用者確認後才寫入各紀錄表，
  並帶 `extraction_id`、來源與信心值。修改品名或份量時移除該品項的營養估算。
  確認時先把 extraction 標記為 confirmed，防止重複送出。
- 照片在瀏覽器端縮成最長邊 1600 px 的 JPEG；原始上傳檔存 R2（`users/{userId}/{kind}/{yyyy-mm}/`）。
- 每位使用者每小時最多 60 次 AI 請求；每次請求記錄 token / 秒數 / 費用與耗時，設定頁顯示本月用量。
- 預設模型：fast `anthropic/claude-haiku-5.5`、vision `google/gemini-3.8-flash`、asr `openai/whisper-large-v3`、
  reasoning `anthropic/claude-sonnet-5.5`、medical_summary `anthropic/claude-opus-5.5`（皆有 ZDR 端點）。
- 尚未支援：語音記錄用藥、症狀（Sprint 5）。

## 待驗證的技術風險

- 含媒體的備份需串流壓縮與 Drive resumable upload，避免超過 Workers 128MB 記憶體。
- 若使用 Cloudflare AI Gateway，必須關閉 prompt logging。
- AI 營養估算的準確度需以實際使用回饋調整 prompt。
