import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getDb, getEnv } from "@/db";
import { userSettings } from "@/db/schema";
import { DEFAULT_MODEL_PROFILES, MODEL_PROFILE_META } from "@/lib/ai/model-profiles";
import { requireUser } from "@/lib/auth/dal";
import { MODEL_PROFILE_KEYS } from "@/lib/enums";
import { fromDateTimeLocalValue, toLocalDate } from "@/lib/time";
import { HOURLY_AI_LIMIT, usageSince } from "@/server/ai/extractions";
import { listModelProfiles } from "@/server/ai/model-profiles";
import { foodPhotoPersonalization } from "@/server/ai/food-feedback";
import {
  resetModelProfileAction,
  updateAiLogging,
  updateFoodPhotoHints,
  updateFoodPhotoLearning,
  updateModelProfile,
} from "./actions";
import { FoodHintsForm } from "./food-hints-form";
import { ModelProfileForm } from "./model-profile-form";

export const metadata: Metadata = { title: "AI 模型" };

export default async function AiSettingsPage() {
  const user = await requireUser();
  const db = await getDb();
  const env = await getEnv();

  const monthStart = fromDateTimeLocalValue(`${toLocalDate(new Date(), user.timezone).slice(0, 8)}01T00:00`, user.timezone);
  const [profiles, usage, [settings], foodPhoto] = await Promise.all([
    listModelProfiles(db),
    usageSince(db, user.id, monthStart),
    db.select({ aiLogRawContent: userSettings.aiLogRawContent }).from(userSettings).where(eq(userSettings.userId, user.id)),
    foodPhotoPersonalization(db, user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="AI 模型" backHref="/settings" backLabel="設定" />

      <section className="space-y-1 rounded-xl border border-border bg-surface p-4 text-sm">
        <p>
          OpenRouter API Key：
          {env.OPENROUTER_API_KEY ? (
            <span className="text-accent">已設定</span>
          ) : (
            <span className="text-warning">未設定（請在 Cloudflare 新增 Secret：OPENROUTER_API_KEY）</span>
          )}
        </p>
        <p>
          本月用量：{usage.requests} 次・約 US$ {usage.cost.toFixed(4)}
        </p>
        <p className="text-muted">每小時上限 {HOURLY_AI_LIMIT} 次 AI 請求。</p>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">各用途使用的模型</h2>
          <p className="text-sm text-muted">
            填入 OpenRouter 的模型 ID。儲存時會檢查模型是否存在、支援該用途，且具備零資料保留（ZDR）端點。
          </p>
        </div>
        {MODEL_PROFILE_KEYS.map((key) => {
          const profile = profiles[key];
          const meta = MODEL_PROFILE_META[key];
          return (
            <div key={key} className="space-y-2 rounded-xl border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium">{meta.label}</h3>
                {profile.isDefault ? (
                  <span className="text-xs text-muted">預設</span>
                ) : (
                  <form action={resetModelProfileAction}>
                    <input type="hidden" name="key" value={key} />
                    <button type="submit" className="text-xs text-accent">
                      恢復預設（{DEFAULT_MODEL_PROFILES[key].modelId}）
                    </button>
                  </form>
                )}
              </div>
              <p className="text-xs text-muted">{meta.usedFor}</p>
              <ModelProfileForm
                key={profile.modelId}
                action={updateModelProfile.bind(null, key)}
                modelId={profile.modelId}
                label={meta.label}
              />
            </div>
          );
        })}
      </section>

      <section id="food-photo" className="scroll-mt-20 space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">照片辨識個人化</h2>
        <p className="text-sm text-muted">
          辨識飲食照片時，會一起附上你寫的飲食習慣，以及從你過去修正中整理出的重點，讓估算更接近你的實際狀況。不會用來訓練模型，也不含身分資料。
        </p>
        <div className="space-y-1">
          <h3 className="text-sm font-medium">你的飲食習慣</h3>
          <FoodHintsForm action={updateFoodPhotoHints} defaultValue={foodPhoto.hints ?? ""} />
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">從修正中學習：{foodPhoto.learning ? "開啟" : "關閉"}</h3>
            <form action={updateFoodPhotoLearning}>
              <input type="hidden" name="enabled" value={String(!foodPhoto.learning)} />
              <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm">
                {foodPhoto.learning ? "關閉" : "開啟"}
              </button>
            </form>
          </div>
          {foodPhoto.learning &&
            (foodPhoto.learned.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                {foodPhoto.learned.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">還沒有足夠的修正紀錄。確認照片辨識結果時修改品項或份量，這裡就會整理出重點。</p>
            ))}
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">AI 原始回應紀錄</h2>
        <p className="text-sm text-muted">
          結構化結果一律保存，以便追溯與修正。開啟後會另外保存模型的原始回應文字，僅供除錯使用；預設關閉。
        </p>
        <form action={updateAiLogging} className="flex items-center justify-between gap-2">
          <span className="text-sm">目前：{settings?.aiLogRawContent ? "開啟" : "關閉"}</span>
          <input type="hidden" name="enabled" value={String(!settings?.aiLogRawContent)} />
          <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm">
            {settings?.aiLogRawContent ? "關閉" : "開啟"}
          </button>
        </form>
      </section>
    </div>
  );
}
