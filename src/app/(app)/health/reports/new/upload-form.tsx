"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, inputClass } from "@/components/form";
import { resizeImage } from "@/app/(app)/log/ai/image";

export function UploadForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const isPdf = files.length === 1 && files[0].type === "application/pdf";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (files.length === 0) return setError("請選擇報告檔案");
    setBusy(true);
    setError(undefined);
    try {
      const form = new FormData();
      if (title.trim()) form.set("title", title.trim());
      for (const file of files) {
        // 圖片在瀏覽器端縮小；報告文字較小，保留較高解析度
        const upload =
          file.type === "application/pdf"
            ? file
            : new File([await resizeImage(file, 2400, 0.9)], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
        form.append("files", upload);
      }
      const response = await fetch("/api/health/reports", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as { documentId?: string; error?: string } | null;
      if (!response.ok || !json?.documentId) throw new Error(json?.error ?? "上傳失敗，請稍後再試");
      router.push(`/health/reports/${json.documentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上傳失敗，請稍後再試");
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <p className="rounded-xl border border-warning/40 p-4 text-sm text-warning">
        尚未設定 OpenRouter API Key，無法自動辨識報告。你仍可以「手動新增檢驗值」。
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormError message={error} />
      <Field label="報告檔案" hint="一份 PDF（15 MB 內），或多張照片 / 截圖（最多 12 張，依頁序選取）">
        <input
          type="file"
          accept="application/pdf,image/*"
          multiple
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            setFiles(selected);
            setError(
              selected.some((f) => f.type === "application/pdf") && selected.length > 1
                ? "PDF 一次只能上傳一份，請不要和圖片混選"
                : undefined,
            );
          }}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-2"
        />
      </Field>
      {files.length > 0 && (
        <p className="text-sm text-muted">
          已選擇 {isPdf ? "1 份 PDF" : `${files.length} 張圖片`}
        </p>
      )}
      <Field label="名稱（選填）" htmlFor="title">
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如 2026 年度健檢"
          maxLength={100}
          className={inputClass}
        />
      </Field>
      <button
        type="submit"
        disabled={busy || files.length === 0}
        className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground disabled:opacity-60"
      >
        {busy ? "上傳中…" : "上傳並辨識"}
      </button>
      <p className="text-xs text-muted">
        原始檔案會完整保存。AI 只會送到不保留資料的服務端點，擷取結果需經你逐項確認才會存入。
      </p>
    </form>
  );
}
