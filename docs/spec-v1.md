# Personal Health Copilot — Web App 規格文件

**版本**：v1.0  
**日期**：2026-10-20  
**定位**：個人長期健康追蹤、行為分析與改善輔助工具（非醫療診斷系統）

---

## 1. 產品目標

建立一個以個人健檢資料為 baseline 的 Web App，持續記錄每日健康行為、生理量測、飲食、睡眠、運動、藥物／維他命與症狀，並透過 AI 進行結構化分析、趨勢追蹤與週期性回顧。

產品核心不是單純「記錄健康資料」，而是建立：

> **Health Baseline → Daily Behavior → Measurement → Trend → AI Review → Action → Re-evaluation**

的閉環流程。

### 1.1 核心目標

1. 將歷年健檢與醫療檢查結果結構化，作為長期 Health Baseline。
2. 降低每日健康紀錄成本，優先支援拍照、語音與快速選取。
3. 將飲食、睡眠、運動、藥物與生理數據放在同一時間軸上分析。
4. 每週、每月、每季產生可執行的健康回顧與改善建議。
5. 所有 AI 推論保留來源、信心值與可修正性，不把 AI 估算視為醫療事實。
6. Google 僅作為：
   - Google Account 登入／身份驗證
   - Google Drive 備份與同步
   - Health Connect 為未來可選整合，不列入 MVP 必要條件

---

## 2. 產品範圍

### 2.1 MVP（P0）

- Google 帳號登入
- Health Profile / 健檢資料匯入
- 生理量測記錄
- 飲食／飲水記錄
- 睡眠記錄
- 藥物／維他命記錄
- 步數／運動記錄
- 症狀與事件記錄
- OpenRouter AI Gateway
- 圖片／文字／語音輸入
- 每週 AI Review
- Google Drive 備份與還原
- Dashboard / Trend Charts

### 2.2 第二階段（P1）

- 每月 Review
- 每季 Review
- Experiment 模組
- Correlation Explorer
- Doctor Summary 匯出
- Google Drive 自動版本備份
- Apple Health / Health Connect companion architecture

### 2.3 暫不列入 MVP

- 社群
- 好友／家人共享
- 保險整合
- 醫院 HIS / EMR 串接
- 自動醫療診斷
- AI 自動開藥或調整藥物
- 即時連續式 ASR

---

# 3. Health Baseline

健檢資料為整個系統的「低頻、高可信度」基準資料。

目前 baseline 應包含：

- 身高
- 體重
- 腰圍
- BMI
- 血壓
- 體脂
- 內臟脂肪
- 空腹血糖
- HbA1c
- TG
- HDL
- LDL
- Total Cholesterol
- GOT / AST
- GPT / ALT
- γ-GT
- Creatinine
- eGFR
- Uric Acid
- PSA
- AFP
- 心血管風險
- 超音波結果
- B 型肝炎相關結果
- 過敏原 IgE
- ANA
- 其他未來新增項目

### 3.1 Health Report Import

支援：

- PDF
- JPG / PNG
- 多頁報告
- 手機拍照

流程：

```text
Upload
  ↓
Document Classification
  ↓
VLM / OCR-like extraction
  ↓
Structured LabObservation[]
  ↓
User Review
  ↓
Confirmed Health Baseline
```

### 3.2 Health Observation Schema

```ts
interface LabObservation {
  id: string
  userId: string
  code: string
  displayName: string
  value?: number
  textValue?: string
  unit?: string
  measuredAt: string
  referenceMin?: number
  referenceMax?: number
  abnormalFlag?: "low" | "high" | "critical" | "normal" | "unknown"
  sourceDocumentId?: string
  sourcePage?: number
  source: "hospital_report" | "manual" | "ai_extract"
  confidence?: number
  verifiedByUser: boolean
}
```

### 3.3 原始文件保存

系統必須保存：

- 原始 PDF / 圖片
- AI extraction JSON
- 使用者確認後資料

三者分離，不覆寫原始資料。

---

# 4. Daily Measurements

## 4.1 支援數據

### P0

- 體重
- 收縮壓
- 舒張壓
- 心率
- 腰圍

### P1

- 體脂率
- 骨骼肌
- 血氧 SpO₂
- 體溫
- 血糖
- HRV
- 靜息心率

## 4.2 統一 Observation 模型

```ts
interface Observation {
  id: string
  userId: string
  type: string
  timestamp: string
  values: Record<string, number | string>
  unit?: string
  source:
    | "manual"
    | "smart_device"
    | "screenshot"
    | "health_connect"
    | "apple_health"
    | "ai_extract"
  confidence?: number
  note?: string
  context?: Record<string, unknown>
}
```

血壓 context 範例：

```json
{
  "position": "sitting",
  "afterRestMinutes": 5,
  "beforeBreakfast": true,
  "arm": "left"
}
```

---

# 5. Food & Drink

## 5.1 輸入方式

1. 拍照
2. 文字
3. 語音
4. 常用餐點快速選取
5. 複製前一次餐點

## 5.2 AI Food Analysis

VLM 分析：

- 食物種類
- 大約份量
- 烹調方式
- 是否有醬汁
- 飲料類型

LLM / Nutrition estimator 結構化：

- kcal
- protein
- fat
- carbohydrate
- fiber
- sugar
- sodium
- caffeine
- alcohol

所有營養值預設標記為：

> **Estimated**

不得與檢驗數值使用相同可信度表示。

## 5.3 User Confirmation

AI 產生結果後必須讓使用者：

- 確認
- 修改食物名稱
- 修改份量
- 增刪項目

### Food Event

```ts
interface FoodEvent {
  id: string
  userId: string
  mealType: "breakfast" | "lunch" | "dinner" | "snack" | "other"
  occurredAt: string
  inputType: "photo" | "text" | "voice" | "quick_item"
  foodItems: FoodItem[]
  totalNutrition?: NutritionEstimate
  aiConfidence?: number
  verifiedByUser: boolean
}
```

---

# 6. Drink Tracking

飲水資料獨立於 Food。

類型：

- 水
- 咖啡
- 茶
- 牛奶
- 含糖飲料
- 酒精
- 其他

結構化欄位：

```text
volume_ml
water_ml
caffeine_mg
sugar_g
alcohol_g
```

用途：

- 睡眠 vs 咖啡因
- 飲酒 vs 睡眠
- 飲酒 vs TG / γ-GT
- 水量 vs 尿酸 / 腎結石追蹤

---

# 7. Sleep

## 7.1 輸入方式

### Manual

- 上床時間
- 推估入睡時間
- 起床時間
- 夜間醒來次數
- 主觀睡眠品質 1–5

### Screenshot Import

支援其他 App 截圖，由 VLM 解析：

- total sleep
- awake
- deep sleep
- REM
- sleep start
- sleep end
- heart rate
- HRV

所有 screenshot-derived data 必須保存：

```text
source = screenshot
confidence
original_image_id
```

並由使用者確認。

---

# 8. Medication & Supplements

## 8.1 Definition 與 Event 分離

### Medication Definition

```ts
interface Medication {
  id: string
  name: string
  category: "prescription" | "otc" | "supplement"
  dose?: number
  unit?: string
  schedule?: string
  timing?: "before_meal" | "after_meal" | "bedtime" | "any"
  active: boolean
}
```

### Medication Event

```ts
interface MedicationEvent {
  medicationId: string
  scheduledAt?: string
  takenAt?: string
  status: "taken" | "skipped" | "late" | "unknown"
  actualDose?: number
}
```

## 8.2 快速操作

Dashboard 顯示：

```text
Morning
✓ Vitamin D
✓ Fish Oil
☐ B Complex
☐ L-Arginine
```

---

# 9. Activity & Exercise

## 9.1 Daily Activity

- steps
- distance
- active minutes
- active calories（optional）

## 9.2 Exercise Session

```ts
interface ExerciseSession {
  id: string
  type:
    | "walking"
    | "running"
    | "cycling"
    | "strength"
    | "swimming"
    | "hiking"
    | "other"
  startedAt: string
  durationMin: number
  intensity?: "low" | "moderate" | "high"
  rpe?: number
  afterMeal?: boolean
  note?: string
}
```

`afterMeal` 為核心欄位，方便分析飯後活動習慣與代謝相關趨勢。

---

# 10. Symptoms & Events

此模組列為 P0。

記錄：

- 蕁麻疹
- 頭暈
- 心悸
- 腹痛
- 腹瀉
- 頭痛
- 疲勞
- 過敏反應
- 發燒
- 胸痛
- 呼吸困難
- 飲酒
- 熬夜
- 生病
- 特殊壓力事件

```ts
interface SymptomEvent {
  id: string
  type: string
  occurredAt: string
  severity: 1 | 2 | 3 | 4 | 5
  durationMin?: number
  note?: string
  relatedFoodEventIds?: string[]
  medicationEventIds?: string[]
}
```

此資料提供未來 correlation / event analysis 使用。

---

# 11. Voice Input / ASR

AI Provider 統一走 OpenRouter。

## 11.1 MVP 互動

採：

> **Push-to-Talk → Upload Audio → ASR → Structured LLM → User Confirm**

不做即時 continuous streaming。

使用情境：

```text
「剛剛三點喝了一杯大杯無糖拿鐵，吃兩塊鳳梨酥。」
```

ASR：

```text
text transcription
```

LLM：

```json
{
  "events": [
    {
      "type": "drink",
      "name": "無糖拿鐵",
      "size": "large"
    },
    {
      "type": "food",
      "name": "鳳梨酥",
      "quantity": 2
    }
  ]
}
```

---

# 12. AI Architecture

AI 不採單一模型完成所有工作。

## 12.1 Layer 1 — Extraction

用途：

- Food image → food items
- Health report → data
- Sleep screenshot → data
- Audio → transcription

模型偏好：快速、低成本、多模態。

## 12.2 Layer 2 — Structuring

自然語言 → Schema。

所有輸出需經 Zod / JSON Schema validation。

主要 Schema：

```text
FoodEventSchema
ObservationSchema
SleepSessionSchema
MedicationEventSchema
ExerciseSessionSchema
SymptomEventSchema
LabObservationSchema
```

## 12.3 Layer 3 — Reasoning

使用較強 reasoning model，處理：

- Weekly Review
- Monthly Review
- Quarterly Review
- Health Goal Review
- Correlation Explanation
- Doctor Summary

Reasoning model 不直接讀取所有 raw event。

由 server 先聚合：

```text
7-day summary
30-day summary
90-day summary
baseline
health goals
notable events
trend deltas
```

再提供給模型。

---

# 13. OpenRouter Model Router

模型不可 hard-code。

```ts
interface ModelProfile {
  key: "fast" | "vision" | "reasoning" | "medical_summary" | "asr"
  provider: "openrouter"
  modelId: string
  temperature?: number
  maxTokens?: number
}
```

可由 Settings / Admin 調整：

| Task | Model Profile |
|---|---|
| Food Vision | vision |
| Report Vision | vision |
| Sleep Screenshot | vision |
| Daily Parsing | fast |
| Weekly Review | reasoning |
| Quarterly Review | medical_summary |
| Voice Input | asr |

---

# 14. Google Integration（修正版）

Google 整合只包含：

1. **Google Account Authentication**
2. **Google Drive Backup / Sync**
3. **Health Connect：Optional / Future**

不包含 Google Calendar。

---

## 14.1 Google Account Authentication

用途：

- Sign in with Google
- 建立 User identity
- 取得基本 profile

採用：

- Google OAuth 2.0
- OpenID Connect
- Web Application OAuth Client

後端保存：

```text
google_subject_id
email
name
avatar_url
```

Google OAuth refresh token 與 Drive token 必須 server-side 保存並加密。

### Scope 原則

Authentication 與 Drive 權限分開處理。

登入初期只要求最小 identity scope：

```text
openid
email
profile
```

使用者第一次啟用 Google Drive Backup 時，再另外要求 Drive scope。

這避免登入時一次要求過多權限。

---

# 15. Google Drive Sync / Backup

Google Drive 的定位不是 transactional database，而是：

> **Personal Backup + Restore + Portable Archive**

PostgreSQL 仍為主要資料來源（Source of Truth）。

## 15.1 Sync Strategy

```text
PostgreSQL
     │
     │ snapshot / incremental export
     ▼
Backup Service
     │
     ▼
Google Drive
```

避免每次 Event 都直接寫 Google Drive。

原因：

- Drive 不是 transactional database
- API latency 高
- conflict handling 複雜
- 大量細碎 event 不適合逐筆同步

---

## 15.2 建議 Drive 儲存結構

```text
My Drive/
└── Personal Health Copilot/
    ├── manifest.json
    ├── backups/
    │   ├── 2026-10-20T220000Z.zip
    │   ├── 2026-10-27T220000Z.zip
    │   └── ...
    ├── exports/
    │   ├── health-data-2026-Q4.json
    │   └── doctor-summary-2026-Q4.pdf
    └── documents/
        └── optional-user-export/
```

原始照片／PDF 的主要 storage 仍建議放 S3 / R2 / MinIO。

Google Drive backup 可由設定決定是否包含 media。

---

## 15.3 Google Drive Scope

優先採 least-privilege：

```text
https://www.googleapis.com/auth/drive.file
```

讓 App 僅管理自己建立／使用者授權給 App 的檔案，而不是要求整個 Drive 的完整存取。

MVP 不要求 `drive` full scope。

---

## 15.4 Backup Format

```text
backup.zip
│
├── manifest.json
├── profile.json
├── observations.json
├── lab-observations.json
├── food-events.json
├── drink-events.json
├── sleep.json
├── medications.json
├── medication-events.json
├── activity.json
├── exercise.json
├── symptoms.json
├── ai-reviews.json
└── checksums.json
```

Media optional：

```text
media/
  health_reports/
  food_photos/
  sleep_screenshots/
```

---

## 15.5 Backup Modes

### Manual Backup

使用者按：

> Back up to Google Drive

### Automatic Backup

設定：

```text
Off
Daily
Weekly (default)
Monthly
```

MVP 建議 default：

> Weekly

---

## 15.6 Restore

流程：

```text
Connect Google Drive
   ↓
Find Personal Health Copilot backup
   ↓
Read manifest
   ↓
Validate version + checksum
   ↓
Preview
   ↓
Restore
```

Restore 模式：

```text
Replace local data
Merge
```

MVP 建議只支援：

> Replace / New Account Restore

Merge 延後至 P1，避免 conflict complexity。

---

## 15.7 Backup Metadata

```json
{
  "formatVersion": 1,
  "appVersion": "0.1.0",
  "createdAt": "2026-10-20T22:00:00Z",
  "userId": "...",
  "recordCounts": {
    "observations": 850,
    "foodEvents": 420,
    "sleepSessions": 120
  },
  "includesMedia": false,
  "encrypted": true
}
```

---

# 16. Backup Security

健康資料屬高敏感個資。

Google Drive 檔案建議在 client/server 上傳前先進行 application-level encryption。

## 建議

```text
JSON / files
   ↓
ZIP
   ↓
AES-256-GCM encryption
   ↓
Upload Google Drive
```

加密 key 不應與 backup file 存在同一位置。

可採：

- Account-derived key + server KMS
- User recovery secret

MVP 可先由 server KMS 管理 key；P1 再加入 zero-knowledge / recovery key 模式。

---

# 17. Optional Google Health Integration

Health data integration 為 optional，不影響 Web App MVP。

## 17.1 Health Connect 限制

Google Health Connect 是 Android native API / SDK；純瀏覽器 Web App 無法直接讀取 Android Health Connect database。

因此建議未來架構：

```text
Web App
    │
    │ API
    ▼
Backend
    ▲
    │
Android Companion App
    │
    ▼
Health Connect
```

Android companion 負責經使用者授權後同步：

- Steps
- Exercise
- Heart rate
- Resting heart rate
- Sleep
- Weight
- Blood pressure（若來源 App 有寫入）

## 17.2 Integration Policy

Health Connect 資料必須保留：

```text
source_app
source_device
record_id
start_time
end_time
sync_time
```

避免與 manual entry 重複。

## 17.3 MVP 決策

```text
Health Connect = Disabled / Future
```

第一版以：

- Manual
- Screenshot
- CSV / file import（P1）

為主。

---

# 18. Review System

## 18.1 Weekly Review

回答：

> 本週發生什麼改變？

內容：

- 體重 7-day trend
- BP average
- Resting HR
- Sleep average
- Step average
- Exercise count
- 飲食結構
- Medication adherence
- Symptoms

輸出：

```text
Wins
Concerns
Possible Patterns
Next Week Focus (1–3 items)
```

---

## 18.2 Monthly Review

回答：

> 哪些行為可能與健康變化有關？

比較：

- 前 30 天
- 前一個月
- baseline

AI 必須區分：

```text
Observation
Correlation
Hypothesis
Recommendation
```

禁止將 correlation 表述為 causal conclusion。

---

## 18.3 Quarterly Review

對照 Health Goals：

```text
HbA1c
TG
HDL
LDL
Waist
Weight
BP
Exercise
Sleep
```

季度 Review 應產生：

- Objective progress
- KPI progress
- Possible contributing behaviors
- Next-quarter strategy
- 建議需要複檢的 lab 項目

「複檢建議」只做提醒，不宣稱替代醫師判斷。

---

# 19. Dashboard

首頁原則：

> Today + Trend + Action

## 19.1 Today

```text
Weight      85.2 kg
BP          128 / 82
Heart Rate  73 bpm
Steps       6,842 / 8,000
Sleep       6h 42m
Food        3 meals logged
Medication  5 / 6 taken
```

## 19.2 AI Insight

最多 3 件：

```text
• 本週晚餐平均時間比前週晚 42 分鐘
• 最近 3 天平均睡眠低於 7 小時
• 本週已有 3 天完成飯後步行
```

## 19.3 Today Focus

只給 1–3 個 action。

不設置無科學依據的單一「Health Score」。

建議分 domain：

```text
Metabolic
Cardiovascular
Sleep
Activity
Adherence
```

---

# 20. Health Goals

```ts
interface HealthGoal {
  id: string
  metric: string
  baselineValue?: number
  targetValue?: number
  targetDate?: string
  direction: "increase" | "decrease" | "maintain"
  status: "active" | "achieved" | "paused"
}
```

例：

```text
HbA1c       6.2 → <5.9
TG          193 → <150
HDL          33 → >40
Waist        92 → <90 cm
```

---

# 21. Experiment

提供 N-of-1 個人改善實驗。

例：

```text
Experiment: Dinner Walk
Duration: 4 weeks
Protocol: Mon–Fri, dinner + 15 min walk
```

系統追蹤：

- adherence
- daily steps
- sleep
- weight
- BP
- symptoms

AI 僅判斷趨勢與關聯，不宣稱醫療因果。

---

# 22. Correlation Explorer

使用者可選：

```text
X = Sleep Duration
Y = Resting Heart Rate
```

或：

```text
Alcohol → Sleep
Caffeine → Sleep
After-meal walking → Weight trend
Exercise → Resting HR
```

介面固定顯示：

> Correlation does not imply causation.

樣本數不足時回傳：

> Insufficient data.

---

# 23. Doctor Summary

提供 30 / 90 / 180 天摘要。

內容：

```text
Current Metrics
Trend
Medication
Supplements
Symptoms
Important Events
Latest Labs
Questions for Doctor
```

支援匯出：

- PDF
- JSON
- CSV

---

# 24. Safety Rule Engine

危險訊號不得完全依賴 LLM。

使用 deterministic rule engine。

例如：

```text
Severe BP threshold
Syncope
Chest pain
Severe dyspnea
Possible anaphylaxis
```

Safety output 使用固定文案與就醫建議。

LLM 可補充說明，但不得覆蓋 safety rule。

---

# 25. Information Architecture

```text
Dashboard
│
├── Today
│   ├── Measurements
│   ├── Food & Drink
│   ├── Medication
│   ├── Activity
│   ├── Sleep
│   └── Symptoms
│
├── Timeline
│
├── Health
│   ├── Baseline
│   ├── Lab Results
│   ├── Health Reports
│   ├── Allergies
│   └── Goals
│
├── Insights
│   ├── Weekly
│   ├── Monthly
│   ├── Quarterly
│   ├── Correlations
│   └── Experiments
│
├── Reports
│   └── Doctor Summary
│
└── Settings
    ├── Profile
    ├── AI Models
    ├── Google Account
    ├── Google Drive Backup
    ├── Data & Privacy
    └── Health Integrations
```

---

# 26. Database Schema（核心）

```text
users
health_profiles
health_goals
health_documents
lab_observations
observations
food_events
food_items
drink_events
medications
medication_schedules
medication_events
sleep_sessions
activity_daily
exercise_sessions
symptom_events
ai_extractions
ai_reviews
experiments
experiment_events
integrations
google_drive_backups
oauth_tokens
```

---

# 27. Storage Architecture

```text
PostgreSQL
  └─ structured health data

Object Storage (S3 / R2 / MinIO)
  ├─ health report PDFs
  ├─ food photos
  ├─ sleep screenshots
  └─ audio clips

Google Drive
  └─ encrypted backup / export
```

---

# 28. Proposed Technical Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind / component library
- ECharts or Recharts

## Backend

- Next.js API / Server Actions initially
- Future dedicated backend if workload increases

## Data

- PostgreSQL
- Prisma / Drizzle
- Zod

## Storage

- S3 / Cloudflare R2 / MinIO

## Authentication

- Google OAuth 2.0 / OpenID Connect

## AI

- OpenRouter
- VLM
- LLM
- ASR

## Background Jobs

- Queue / cron worker
- weekly review
- monthly review
- quarterly review
- Drive backup

---

# 29. Privacy & Security

健康資料視為高敏感個資。

必要要求：

- HTTPS only
- encrypted DB volume
- encrypted object storage
- OAuth tokens encrypted at rest
- Google Drive backup application-level encryption
- signed URLs for media
- audit log
- user data export
- user data deletion
- AI request log 可選擇不保存原始健康內容

模型 request 必須避免送出不必要的 identity data。

例如 AI 不需要知道姓名即可分析飲食或睡眠。

---

# 30. MVP User Flow

## Morning

```text
Open App
  ↓
Weight
BP
Sleep
Medication
```

目標：30–60 秒內完成。

## During Day

```text
Photo Meal
or
Voice Input
```

AI structured → confirm → save。

## Exercise

```text
Quick Add
or
Voice
```

## Night

顯示：

```text
Missing / incomplete items
Today's summary
```

## Sunday

```text
Weekly AI Review
  ↓
1–3 actions for next week
```

---

# 31. MVP Development Priority

## Sprint 1 — Foundation

- Google Login
- User Profile
- PostgreSQL schema
- Observation
- basic Dashboard

## Sprint 2 — Daily Tracking

- Weight / BP / HR
- Food text
- Food image
- Drink
- Medication

## Sprint 3 — AI Input

- OpenRouter Gateway
- VLM extraction
- ASR
- structured parsing
- confidence / verification flow

## Sprint 4 — Health Records

- PDF / image report upload
- lab extraction
- baseline timeline
- health goals

## Sprint 5 — Lifestyle

- Sleep
- Steps
- Exercise
- Symptoms

## Sprint 6 — Insight

- Aggregation service
- Weekly Review
- trend charts
- Today Focus

## Sprint 7 — Google Drive

- Drive OAuth consent
- encrypted backup
- manual backup
- weekly auto backup
- restore

---

# 32. Architecture Overview

```text
                     ┌─────────────────────┐
                     │      Next.js Web     │
                     │   Desktop / Mobile   │
                     └──────────┬───────────┘
                                │
                  ┌─────────────┼─────────────┐
                  │             │             │
                  ▼             ▼             ▼
             App API       Upload API      Auth API
                  │             │             │
                  │             │             ▼
                  │             │        Google OAuth
                  │             │
        ┌─────────┼─────────────┘
        │         │
        ▼         ▼
   PostgreSQL  Object Storage
        │
        ├───────────────────────────────┐
        │                               │
        ▼                               ▼
Aggregation / Review              AI Gateway
Service                            OpenRouter
                                      │
                           ┌──────────┼──────────┐
                           ▼          ▼          ▼
                          VLM        LLM        ASR

        │
        ▼
Google Backup Service
        │
        ▼
Google Drive

Optional Future:
Android Companion → Health Connect → Backend API
```

---

# 33. Google Integration Final Decision

第一版 Google 功能明確定義為：

```text
[Required]
Google Login
Google Drive Backup / Restore

[Optional / Future]
Health Connect via Android Companion

[Not Included]
Google Calendar
Legacy Google Fit integration
```

這樣可以維持 Web App 架構單純，同時保留未來 wearable / health ecosystem 的擴充空間。

---

# 34. Reference Notes

Google implementation 依官方文件為準：

- Google OAuth 2.0 / OpenID Connect  
  https://developers.google.com/identity/protocols/oauth2/

- Google Drive API  
  https://developers.google.com/workspace/drive/api/guides/about-sdk

- Google Drive app-specific / application data concepts  
  https://developers.google.com/workspace/drive/api/guides/search-files

- Android Health Connect  
  https://developer.android.com/health-and-fitness/health-connect/get-started

---

# 35. Product Principle

此產品的核心不是：

> 「幫使用者記錄更多資料。」

而是：

> **降低健康資料紀錄成本，將低頻健檢與高頻生活行為放進同一時間軸，讓使用者可以逐步驗證哪些改變真的對自己的健康有幫助。**

AI 負責：

- Extraction
- Structuring
- Summarization
- Pattern Discovery
- Hypothesis Generation

但最終 medical interpretation、diagnosis 與 treatment decision 不由 AI 自動決定。
