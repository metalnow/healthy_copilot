"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError, inputClass } from "@/components/form";
import { RESTORE_CONFIRM_TEXT } from "@/lib/backup/format";

type Preview = {
  createdAt: string;
  recordCounts: Record<string, number>;
  includesMedia: boolean;
  mediaFiles: number;
};

type DriveBackup = { id: string; name: string; createdTime?: string; size?: string };

const COUNT_LABELS: Record<string, string> = {
  observations: "量測",
  "lab-observations": "檢驗值",
  "food-events": "飲食",
  "drink-events": "飲料",
  sleep: "睡眠",
  activity: "步數",
  exercise: "運動",
  symptoms: "症狀",
  medications: "藥物",
  "medication-events": "服藥紀錄",
  "health-documents": "健檢報告",
  goals: "目標",
  "ai-reviews": "AI 回顧",
};

function formatSize(size?: string) {
  if (!size) return "";
  const kb = Number(size) / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
}

export function RestorePanel({ driveBackups, timeZone }: { driveBackups: DriveBackup[] | null; timeZone: string }) {
  const router = useRouter();
  const [source, setSource] = useState<{ fileId?: string; file?: File; label: string }>();
  const [recoveryKey, setRecoveryKey] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  const call = async (mode: "preview" | "restore") => {
    if (!source) return;
    setBusy(mode === "preview" ? "讀取備份中…" : "還原中…");
    setError(undefined);
    const form = new FormData();
    form.set("mode", mode);
    if (source.fileId) form.set("fileId", source.fileId);
    if (source.file) form.set("file", source.file);
    if (recoveryKey.trim()) form.set("recoveryKey", recoveryKey.trim());
    if (mode === "restore") form.set("confirm", confirm);
    try {
      const response = await fetch("/api/backup/restore", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as
        | { preview?: Preview; restored?: boolean; error?: string; needsRecoveryKey?: boolean }
        | null;
      if (!response.ok) {
        setNeedsKey(Boolean(json?.needsRecoveryKey));
        throw new Error(json?.error ?? "操作失敗");
      }
      if (json?.preview) setPreview(json.preview);
      if (json?.restored) {
        setDone(true);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusy(undefined);
    }
  };

  const choose = (next: { fileId?: string; file?: File; label: string }) => {
    setSource(next);
    setPreview(undefined);
    setConfirm("");
    setError(undefined);
    setDone(false);
  };

  if (done) {
    return <p className="rounded-lg bg-accent/10 p-3 text-sm text-accent">還原完成。所有頁面都已改為備份中的資料。</p>;
  }

  return (
    <div className="space-y-3">
      {driveBackups && driveBackups.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {driveBackups.map((b) => (
            <li key={b.id}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2">
                <input
                  type="radio"
                  name="backup"
                  checked={source?.fileId === b.id}
                  onChange={() => choose({ fileId: b.id, label: b.name })}
                  className="accent-accent"
                />
                <span className="flex-1">
                  {b.createdTime
                    ? new Date(b.createdTime).toLocaleString("zh-TW", { timeZone, dateStyle: "medium", timeStyle: "short" })
                    : b.name}
                </span>
                <span className="text-xs text-muted">{formatSize(b.size)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <label className="block text-sm">
        <span className="text-muted">或上傳備份檔（.hcbackup 或匯出的 .zip）</span>
        <input
          type="file"
          accept=".hcbackup,.zip,application/zip,application/octet-stream"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) choose({ file, label: file.name });
          }}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5"
        />
      </label>

      {needsKey && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">復原金鑰</span>
          <input
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            placeholder="hcrk1-…"
            spellCheck={false}
            className={`${inputClass} font-mono text-sm`}
          />
        </label>
      )}

      <FormError message={error} />

      {source && !preview && (
        <button
          type="button"
          onClick={() => call("preview")}
          disabled={Boolean(busy)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {busy ?? `預覽「${source.label}」`}
        </button>
      )}

      {preview && (
        <div className="space-y-3 rounded-lg border border-warning/40 p-3 text-sm">
          <p>
            備份時間：{new Date(preview.createdAt).toLocaleString("zh-TW", { timeZone })}
            {preview.includesMedia && `・含 ${preview.mediaFiles} 個原始檔`}
          </p>
          <p className="text-muted">
            {Object.entries(preview.recordCounts)
              .filter(([key, n]) => n > 0 && COUNT_LABELS[key])
              .map(([key, n]) => `${COUNT_LABELS[key]} ${n}`)
              .join("・") || "備份中沒有健康紀錄"}
          </p>
          <p className="text-warning">
            還原會以這份備份「取代」目前所有健康資料（帳號與登入狀態不受影響），無法復原。建議先備份目前的資料。
          </p>
          <label className="block space-y-1">
            <span>請輸入「{RESTORE_CONFIRM_TEXT}」確認</span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </label>
          <button
            type="button"
            onClick={() => call("restore")}
            disabled={Boolean(busy) || confirm !== RESTORE_CONFIRM_TEXT}
            className="rounded-lg bg-warning px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ?? "以此備份取代目前資料"}
          </button>
        </div>
      )}
    </div>
  );
}
