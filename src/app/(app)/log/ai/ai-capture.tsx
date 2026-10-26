"use client";

import { useCallback, useRef, useState } from "react";
import { FormError, inputClass } from "@/components/form";
import type { AiTaskResult } from "@/server/ai/tasks";
import { DraftEditor } from "./draft-editor";
import { resizeImage } from "./image";
import { MAX_RECORDING_SECONDS, useRecorder } from "./use-recorder";

type Mode = "photo" | "voice" | "text";

const MODES: { value: Mode; label: string }[] = [
  { value: "photo", label: "📷 拍照" },
  { value: "voice", label: "🎤 語音" },
  { value: "text", label: "⌨️ 文字" },
];

async function postAi(path: string, body: FormData | object): Promise<AiTaskResult> {
  const response = await fetch(path, {
    method: "POST",
    ...(body instanceof FormData
      ? { body }
      : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
  const json = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(json?.error ?? "AI 分析失敗，請稍後再試");
  return json as AiTaskResult;
}

export function AiCapture({ configured, initialMode }: { configured: boolean; initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [result, setResult] = useState<AiTaskResult>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<string>();
  const [text, setText] = useState("");
  // 拍照：先選照片、可加補充說明，再送出分析
  const [photo, setPhoto] = useState<Blob>();
  const [photoNote, setPhotoNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (label: string, task: () => Promise<AiTaskResult>) => {
    setError(undefined);
    setBusy(label);
    try {
      setResult(await task());
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 分析失敗，請稍後再試");
    } finally {
      setBusy(undefined);
    }
  }, []);

  const onAudio = useCallback(
    (blob: Blob) =>
      run("語音辨識中…", () => {
        const form = new FormData();
        form.set("audio", new File([blob], "voice", { type: blob.type }));
        return postAi("/api/ai/voice", form);
      }),
    [run],
  );
  const recorder = useRecorder(onAudio);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    let resized: Blob;
    try {
      resized = await resizeImage(file);
    } catch {
      setError("無法讀取這張照片，請改用 JPEG 或 PNG");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(resized));
    setPhoto(resized);
    setError(undefined);
  };

  const analyzePhoto = () => {
    if (!photo) return;
    run("AI 辨識照片中…", () => {
      const form = new FormData();
      form.set("photo", new File([photo], "food.jpg", { type: "image/jpeg" }));
      if (photoNote.trim()) form.set("note", photoNote.trim());
      return postAi("/api/ai/food-photo", form);
    });
  };

  const reset = () => {
    setResult(undefined);
    setError(undefined);
    setText("");
    setPhoto(undefined);
    setPhotoNote("");
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  if (!configured) {
    return (
      <p className="rounded-xl border border-warning/40 p-4 text-sm text-warning">
        尚未設定 OpenRouter API Key（OPENROUTER_API_KEY），AI 功能暫時無法使用。
      </p>
    );
  }

  if (result) {
    return (
      <div className="space-y-4">
        {preview && result.task === "food_vision" && (
          // eslint-disable-next-line @next/next/no-img-element -- 本機 blob 預覽，不經過 next/image
          <img src={preview} alt="上傳的照片" className="max-h-56 w-full rounded-xl object-cover" />
        )}
        <DraftEditor result={result} onReset={reset} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="輸入方式" className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="tab"
            aria-selected={mode === m.value}
            onClick={() => setMode(m.value)}
            disabled={Boolean(busy) || recorder.recording}
            className="rounded-lg border border-border px-2 py-2 text-sm aria-selected:border-accent aria-selected:bg-accent aria-selected:text-accent-foreground"
          >
            {m.label}
          </button>
        ))}
      </div>

      <FormError message={error ?? recorder.error} />

      {busy ? (
        <div role="status" className="flex flex-col items-center gap-3 py-10 text-muted">
          <span className="size-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          {busy}
        </div>
      ) : mode === "photo" ? (
        <div className="space-y-3">
          {photo && preview && (
            // eslint-disable-next-line @next/next/no-img-element -- 本機 blob 預覽，不經過 next/image
            <img src={preview} alt="選擇的照片" className="max-h-56 w-full rounded-xl object-cover" />
          )}
          {!photo && (
            <div className="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-border bg-surface px-4 pt-6 pb-4 text-center">
              <span className="text-3xl">📷</span>
              <span className="font-medium">餐點、飲料照片</span>
              <span className="text-xs text-muted">AI 會分開辨識食物與飲料，並估算份量與營養</span>
            </div>
          )}
          {/* 有 capture 的 input 在 Android 只會開相機，所以拍照與相簿分成兩個按鈕 */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: photo ? "重新拍照" : "拍照", capture: true },
              { label: photo ? "改選相簿照片" : "從相簿選擇", capture: false },
            ].map((option) => (
              <label
                key={option.label}
                className="flex cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-3 py-3 text-sm font-medium text-accent active:scale-[0.98]"
              >
                {option.label}
                <input
                  ref={option.capture ? cameraRef : fileRef}
                  type="file"
                  accept="image/*"
                  capture={option.capture ? "environment" : undefined}
                  onChange={(e) => onPhoto(e.target.files?.[0])}
                  className="sr-only"
                />
              </label>
            ))}
          </div>
          {photo && (
            <>
              <textarea
                value={photoNote}
                onChange={(e) => setPhotoNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="補充說明或感受（選填），例如：只吃了一半、飲料是半糖、吃完很撐"
                aria-label="照片的補充說明或感受"
                className={inputClass}
              />
              <button
                type="button"
                onClick={analyzePhoto}
                className="w-full rounded-xl bg-accent px-4 py-3 font-medium text-accent-foreground transition active:scale-[0.98]"
              >
                AI 分析
              </button>
            </>
          )}
        </div>
      ) : mode === "voice" ? (
        <div className="flex flex-col items-center gap-4 py-6">
          <button
            type="button"
            onClick={recorder.recording ? recorder.stop : recorder.start}
            aria-pressed={recorder.recording}
            className={`flex size-28 items-center justify-center rounded-full text-4xl text-accent-foreground ${recorder.recording ? "animate-pulse bg-red-600" : "bg-accent"}`}
            aria-label={recorder.recording ? "停止錄音並送出" : "開始錄音"}
          >
            {recorder.recording ? "■" : "🎤"}
          </button>
          <p className="text-sm text-muted">
            {recorder.recording
              ? `錄音中 ${recorder.seconds} / ${MAX_RECORDING_SECONDS} 秒，再按一次送出`
              : "按下開始錄音，例如：「剛剛三點喝了一杯大杯無糖拿鐵，吃兩塊鳳梨酥」"}
          </p>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) run("AI 解析中…", () => postAi("/api/ai/text", { text }));
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="例如：早餐吃了兩顆水煮蛋和一杯美式咖啡，飯後走路 20 分鐘，剛量血壓 128/82"
            aria-label="描述吃了什麼、喝了什麼或量測結果"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground disabled:opacity-60"
          >
            AI 解析
          </button>
        </form>
      )}

      <p className="text-xs text-muted">
        AI 請求只會送到不保留資料的服務端點，且不包含你的姓名或帳號資訊。結果需經你確認才會儲存。
      </p>
    </div>
  );
}
