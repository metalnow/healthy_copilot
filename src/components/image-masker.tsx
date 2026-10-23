"use client";

import { ArrowDownToLine, ArrowUpToLine, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";

/** 遮蓋區域，座標為圖片寬高的比例（0–1） */
export type MaskRect = { x: number; y: number; w: number; h: number };
export type MaskedPage = { file: File; url: string; masks: MaskRect[] };

/** 上方 1/5：多數報告的姓名、生日、病歷號都在表頭 */
const TOP_BAND: MaskRect = { x: 0, y: 0, w: 1, h: 0.2 };
/** 下方 1/12：有些報告每頁頁尾也印著姓名、編號 */
const BOTTOM_BAND: MaskRect = { x: 0, y: 11 / 12, w: 1, h: 1 / 12 };

/** 把遮蓋區域塗黑後輸出 JPEG；送給 AI 與保存的都是塗黑後的圖片 */
export async function applyMasks(file: File, masks: MaskRect[]): Promise<File> {
  if (masks.length === 0) return file;
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("無法處理圖片");
  ctx.drawImage(bitmap, 0, 0);
  ctx.fillStyle = "#000";
  for (const m of masks) ctx.fillRect(m.x * canvas.width, m.y * canvas.height, m.w * canvas.width, m.h * canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("無法處理圖片"))), "image/jpeg", 0.9),
  );
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

function Masks({ masks, editing }: { masks: MaskRect[]; editing?: boolean }) {
  return masks.map((m, i) => (
    <span
      key={i}
      className={`absolute bg-black ${editing ? "ring-1 ring-white/70" : ""}`}
      style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
    />
  ));
}

/** 全螢幕編輯：在圖片上拖曳畫出要塗黑的區域 */
function MaskEditor({
  page,
  index,
  onChange,
  onClose,
}: {
  page: MaskedPage;
  index: number;
  onChange: (masks: MaskRect[]) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number }>();

  const point = (e: React.PointerEvent) => {
    const rect = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };
  const draftRect = draft && {
    x: Math.min(draft.x0, draft.x1),
    y: Math.min(draft.y0, draft.y1),
    w: Math.abs(draft.x1 - draft.x0),
    h: Math.abs(draft.y1 - draft.y0),
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`遮蓋第 ${index + 1} 頁`} className="fixed inset-0 z-50 flex flex-col bg-black pt-safe pb-safe">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm">第 {index + 1} 頁：拖曳畫出要塗黑的區域</span>
        <button type="button" onClick={onClose} className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black">
          完成
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        <div
          ref={boxRef}
          className="relative max-h-full touch-none select-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = point(e);
            setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }}
          onPointerMove={(e) => {
            if (!draft) return;
            const p = point(e);
            setDraft({ ...draft, x1: p.x, y1: p.y });
          }}
          onPointerUp={() => {
            // 太小的框多半是誤觸
            if (draftRect && draftRect.w > 0.01 && draftRect.h > 0.01) onChange([...page.masks, draftRect]);
            setDraft(undefined);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 本機 blob 預覽 */}
          <img src={page.url} alt={`第 ${index + 1} 頁`} draggable={false} className="max-h-[calc(100dvh-9rem)] w-auto max-w-full" />
          <Masks masks={draftRect ? [...page.masks, draftRect] : page.masks} editing />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 px-4 py-3">
        <button type="button" onClick={() => onChange([...page.masks, TOP_BAND])} className="flex items-center justify-center gap-1 rounded-xl bg-white/15 py-2.5 text-sm text-white">
          <ArrowUpToLine aria-hidden className="size-4" />
          遮上方
        </button>
        <button type="button" onClick={() => onChange([...page.masks, BOTTOM_BAND])} className="flex items-center justify-center gap-1 rounded-xl bg-white/15 py-2.5 text-sm text-white">
          <ArrowDownToLine aria-hidden className="size-4" />
          遮下方
        </button>
        <button
          type="button"
          onClick={() => onChange(page.masks.slice(0, -1))}
          disabled={page.masks.length === 0}
          className="flex items-center justify-center gap-1 rounded-xl bg-white/15 py-2.5 text-sm text-white disabled:opacity-40"
        >
          <Undo2 aria-hidden className="size-4" />
          復原
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={page.masks.length === 0}
          className="flex items-center justify-center gap-1 rounded-xl bg-white/15 py-2.5 text-sm text-white disabled:opacity-40"
        >
          <X aria-hidden className="size-4" />
          清除
        </button>
      </div>
    </div>
  );
}

/** 上傳前塗黑照片上的身分資料（姓名、生日、病歷號…） */
export function ImageMasker({ pages, onChange }: { pages: MaskedPage[]; onChange: (pages: MaskedPage[]) => void }) {
  const [editing, setEditing] = useState<number>();
  const setMasks = (index: number, masks: MaskRect[]) =>
    onChange(pages.map((p, i) => (i === index ? { ...p, masks } : p)));
  const masked = pages.filter((p) => p.masks.length > 0).length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
        <p className="font-medium">上傳前請塗黑姓名、生日、身分證、病歷號等個人資料</p>
        <p className="mt-1 text-muted">
          點頁面放大後拖曳畫框；塗黑的部分不會送給 AI，也不會保存。也請留意頁尾是否印有姓名或編號。
        </p>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">
          {pages.length} 頁，已遮蓋 {masked} 頁
        </span>
        {pages.length > 1 && (
          <span className="flex gap-3">
            <button
              type="button"
              onClick={() => onChange(pages.map((p) => ({ ...p, masks: [...p.masks, TOP_BAND] })))}
              className="text-accent"
            >
              每頁遮上方
            </button>
            <button
              type="button"
              onClick={() => onChange(pages.map((p) => ({ ...p, masks: [...p.masks, BOTTOM_BAND] })))}
              className="text-accent"
            >
              每頁遮下方
            </button>
          </span>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {pages.map((page, index) => (
          <li key={page.url}>
            <button
              type="button"
              onClick={() => setEditing(index)}
              aria-label={`遮蓋第 ${index + 1} 頁（已遮 ${page.masks.length} 處）`}
              className="block w-full overflow-hidden rounded-xl border border-border bg-surface text-left"
            >
              <span className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element -- 本機 blob 預覽 */}
                <img src={page.url} alt="" className="block w-full" />
                <Masks masks={page.masks} />
              </span>
              <span className="block px-2 py-1.5 text-xs text-muted">
                第 {index + 1} 頁{page.masks.length > 0 ? `・已遮 ${page.masks.length} 處` : "・點此遮蓋"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {editing !== undefined && (
        <MaskEditor
          page={pages[editing]}
          index={editing}
          onChange={(masks) => setMasks(editing, masks)}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
