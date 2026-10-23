"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, inputClass } from "@/components/form";
import { applyMasks, ImageMasker, type MaskedPage } from "@/components/image-masker";
import { resizeImage } from "@/app/(app)/log/ai/image";
import { redactIdentity } from "@/lib/privacy/redact";
import { extractPdfText, pdfToImages } from "./pdf";

// 與 /api/health/reports 的上限一致
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 12;

/**
 * 準備好的上傳內容：
 * - text：文字型 PDF，保存原檔，但只把移除身分資料後的文字送給 AI
 * - images：照片或掃描型 PDF（轉成圖片），上傳前由使用者塗黑身分資料
 */
type Prepared =
  | { kind: "text"; file: File; text: string; removed: string[] }
  | { kind: "images"; pages: MaskedPage[]; fromPdf: boolean };

export function UploadForm({ configured, ownerNames }: { configured: boolean; ownerNames: string[] }) {
  const router = useRouter();
  const [prepared, setPrepared] = useState<Prepared>();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const prepare = async (selected: File[]) => {
    setPrepared(undefined);
    setError(undefined);
    if (selected.length === 0) return;
    const pdfs = selected.filter((f) => f.type === "application/pdf");
    if (pdfs.length > 0 && selected.length > 1) return setError("PDF 一次只能上傳一份，請不要和圖片混選");
    if (pdfs.length === 0 && selected.length > MAX_IMAGES) return setError(`圖片最多 ${MAX_IMAGES} 張`);

    setBusy("讀取檔案中…");
    try {
      let images = selected;
      if (pdfs.length === 1) {
        const extracted = await extractPdfText(pdfs[0]);
        if (extracted) {
          if (pdfs[0].size > MAX_PDF_BYTES) throw new Error("PDF 太大（上限 15 MB）");
          const { text, removed } = redactIdentity(extracted.text, { names: ownerNames });
          setPrepared({ kind: "text", file: pdfs[0], text, removed });
          return;
        }
        // 沒有文字層的掃描檔：轉成圖片，才能先塗黑身分資料
        setBusy("掃描檔轉成圖片中…");
        images = await pdfToImages(pdfs[0], { maxPages: MAX_IMAGES });
      }
      // 圖片在瀏覽器端縮小；報告文字較小，保留較高解析度
      const pages = await Promise.all(
        images.map(async (file) => {
          const resized = new File([await resizeImage(file, 2400, 0.9)], file.name.replace(/\.\w+$/, ".jpg"), {
            type: "image/jpeg",
          });
          return { file: resized, url: URL.createObjectURL(resized), masks: [] };
        }),
      );
      setPrepared({ kind: "images", pages, fromPdf: pdfs.length === 1 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法讀取這個檔案");
    } finally {
      setBusy(undefined);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!prepared) return setError("請選擇報告檔案");
    setBusy("上傳中…");
    setError(undefined);
    try {
      const form = new FormData();
      if (title.trim()) form.set("title", title.trim());
      if (prepared.kind === "text") {
        form.append("files", prepared.file);
        form.set("text", prepared.text);
      } else {
        for (const page of prepared.pages) form.append("files", await applyMasks(page.file, page.masks));
      }
      const response = await fetch("/api/health/reports", { method: "POST", body: form });
      const json = (await response.json().catch(() => null)) as { documentId?: string; error?: string } | null;
      if (!response.ok || !json?.documentId) throw new Error(json?.error ?? "上傳失敗，請稍後再試");
      router.push(`/health/reports/${json.documentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "上傳失敗，請稍後再試");
      setBusy(undefined);
    }
  };

  if (!configured) {
    return (
      <p className="rounded-xl border border-warning/40 p-4 text-sm text-warning">
        尚未設定 OpenRouter API Key，無法自動辨識報告。你仍可以「手動新增檢驗值」。
      </p>
    );
  }

  const unmasked = prepared?.kind === "images" && prepared.pages.every((p) => p.masks.length === 0);

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormError message={error} />
      <Field label="報告檔案" hint="一份 PDF，或多張照片 / 截圖（最多 12 張，依頁序選取）">
        <input
          type="file"
          accept="application/pdf,image/*"
          multiple
          disabled={Boolean(busy)}
          onChange={(e) => prepare(Array.from(e.target.files ?? []))}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-2"
        />
      </Field>

      {prepared?.kind === "text" && (
        <div className="space-y-2 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <ShieldCheck aria-hidden className="size-4 text-accent" />
            文字型 PDF：AI 只會收到移除身分資料後的文字
          </p>
          <p className="text-muted">
            {prepared.removed.length > 0 ? `已移除：${prepared.removed.join("、")}` : "沒有找到需要移除的身分欄位，請確認下方內容。"}
          </p>
          <details>
            <summary className="cursor-pointer text-accent">查看要送出的文字</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-xs">
              {prepared.text.slice(0, 3000)}
              {prepared.text.length > 3000 && "\n…"}
            </pre>
          </details>
        </div>
      )}

      {prepared?.kind === "images" && (
        <>
          {prepared.fromPdf && <p className="text-sm text-muted">這是掃描型 PDF，已轉成 {prepared.pages.length} 張圖片。</p>}
          <ImageMasker pages={prepared.pages} onChange={(pages) => setPrepared({ ...prepared, pages })} />
        </>
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
      {unmasked && <p className="text-sm text-warning">還沒有塗黑任何區域；確認照片上沒有個人資料再上傳。</p>}
      <button
        type="submit"
        disabled={Boolean(busy) || !prepared}
        className="w-full rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground disabled:opacity-60"
      >
        {busy ?? "上傳並辨識"}
      </button>
      <p className="text-xs text-muted">
        AI 只會送到不保留資料的服務端點，擷取結果需經你逐項確認才會存入。文字型 PDF 會保存原檔；照片保存的是塗黑後的版本。
      </p>
    </form>
  );
}
