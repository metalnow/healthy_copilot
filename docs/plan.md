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
| 4 Health Records | 報告上傳（PDF 原生讀取 / 多張圖片）、檢驗項目擷取、代碼與單位正規化、Baseline 時間軸、健康目標 | ✅ |
| 5 Lifestyle | 睡眠（含截圖）、步數、運動、症狀（**Safety Rule：胸痛、呼吸困難、暈厥、疑似過敏性休克**）、時間軸頁 | ✅ |
| 6 Insight | 彙總服務、週回顧（+ 月回顧）、趨勢圖、Today Focus、AI 洞察 | ✅ |
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
- 尚未支援：語音記錄用藥。

## Sprint 4 實作備註

- 報告上傳：一份 PDF（≤ 15 MB）或最多 12 張圖片。PDF 以 OpenRouter `file` 內容直接交給模型，
  指定 `file-parser` 的 `native` 引擎，不經第三方 OCR；因此「影像辨識」模型必須支援圖片與檔案輸入。
  （取代原計劃的瀏覽器端 pdf.js 轉圖。）
- 擷取在 Queue 背景執行：上傳後文件狀態為 extracting，頁面每 4 秒重新整理；
  逾時 / 供應商錯誤 / 限流最多重試 3 次，其餘錯誤標記為 failed，可手動重新辨識。
- 檢驗代碼表 `src/lib/labs/catalog.ts`：統一代碼、別名、標準單位與換算（mmol/L、µmol/L、IFCC HbA1c 等）。
  確認時數值與參考範圍一起換算；報告未標示高低時依參考範圍判斷。
- 確認畫面逐項可改代碼、數值、單位、參考值、異常標示，可新增 / 刪除項目；低信心項目特別標示。
- 原始檔案經 `/api/media/[id]` 提供（驗證擁有者、`Cache-Control: private, no-store`）。
- 健康目標：檢驗 / 量測指標（體重、腰圍、血壓取日常量測與檢驗中較新者）與行為指標（近 7 天步數、睡眠、運動）。
- D1 每個查詢最多 100 個參數：多列 insert 一律經 `chunkForInsert` 分批。

## Sprint 5 實作備註

- 睡眠：手動輸入上床 / 入睡 / 起床、醒來次數、主觀品質；可從手錶或 App 截圖匯入（vision 擷取後帶入表單確認），
  來源記為 screenshot 並保存原始截圖 id 與信心值。睡眠歸到起床日期。
- 步數 / 活動：每天每個來源一筆，重複輸入會覆蓋。
- 運動：類型、時間、強度、RPE、是否飯後；症狀 / 生活事件：嚴重度 1–5、持續時間、可關聯 24 小時內的飲食。
- AI 語音 / 文字也能解析運動與症狀；這兩類紀錄新增 source、confidence、extraction_id 欄位。
- 危險訊號（固定規則）：胸痛、呼吸困難、暈厥、疑似嚴重過敏（過敏反應 ≥ 3 或蕁麻疹 ≥ 4）、明顯心悸、高燒。
  最近 24 小時內的症狀會在「今日」頁頂端顯示提醒，依嚴重程度排序。
- 時間軸：7 天一頁，可依類別篩選，所有紀錄（含用藥、檢驗）依時間排列，可直接刪除。

## Sprint 6 實作備註

- 彙總服務 `src/lib/insights/aggregate.ts`（純函式、有單元測試）：體重趨勢（最小平方法每週變化）、血壓平均與 ≥140/90 次數、
  心率、睡眠、步數、運動與飯後運動、飲食（估算熱量、晚餐平均時間）、飲料（水、咖啡因、酒精）、用藥完成率、症狀。
  用藥應服次數只計啟用中的藥物、且在排程開始或藥物建立日之後。
- 固定規則的觀察（最多 3 則）：睡眠不足、血壓偏高次數、晚餐時間變化、飯後運動、體重變化、用藥完成率、步數、飲酒天數。
- AI 回顧：週回顧（reasoning 模型，週一到當天；每週日 21:00 由 cron 自動產生）與月回顧（medical_summary 模型）。
  模型只收到彙總數字、baseline、目標進度與固定規則偵測到的事件，不含原始紀錄與身分資訊；
  輸出區分觀察 / 相關 / 假設，禁止因果、診斷與用藥建議。在 Queue 背景執行，頁面輪詢狀態。
- 「今日」頁顯示近 7 天的觀察與最近兩週內週回顧的 1–3 個重點行動。
- 趨勢圖為自製 SVG（`src/components/trend-chart.tsx`）：單一 y 軸、2px 線、端點標值、十字線提示、鍵盤操作、表格檢視；
  配色經 dataviz validator 驗證（單序列藍、血壓藍 / 橘）。檢驗項目歷史也有趨勢圖與參考值線。
- 不提供單一健康分數。季回顧、Correlation Explorer、Experiment、Doctor Summary 為 P1。

## 待驗證的技術風險

- 含媒體的備份需串流壓縮與 Drive resumable upload，避免超過 Workers 128MB 記憶體。
- 若使用 Cloudflare AI Gateway，必須關閉 prompt logging。
- AI 營養估算的準確度需以實際使用回饋調整 prompt。
