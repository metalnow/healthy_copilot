"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_RECORDING_SECONDS = 60;

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

/** Push-to-talk 錄音：開始 → 停止後回傳音檔（超過上限自動停止） */
export function useRecorder(onComplete: (blob: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string>();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(undefined);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("這個瀏覽器不支援錄音");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("無法使用麥克風，請確認已允許麥克風權限");
      return;
    }

    const mimeType = PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      cleanup();
      setRecording(false);
      onComplete(blob);
    };

    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setRecording(true);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) stop();
    }, 250);
  }, [cleanup, onComplete, stop]);

  return { recording, seconds, error, start, stop };
}
