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

/** editingScale：編輯中顯示白色外框，並抵銷縮放讓框線維持細線 */
function Masks({ masks, editingScale }: { masks: MaskRect[]; editingScale?: number }) {
  return masks.map((m, i) => (
    <span
      key={i}
      className="absolute bg-black"
      style={{
        left: `${m.x * 100}%`,
        top: `${m.y * 100}%`,
        width: `${m.w * 100}%`,
        height: `${m.h * 100}%`,
        ...(editingScale && { outline: `${1 / editingScale}px solid rgb(255 255 255 / 0.7)` }),
      }}
    />
  ));
}

type View = { scale: number; x: number; y: number };
type Point = { x: number; y: number };

const MAX_SCALE = 8;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(1, s));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * 全螢幕編輯：一指拖曳畫出要塗黑的區域；兩指捏合縮放、兩指移動畫面（桌機可用滾輪縮放）。
 */
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number }>();
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ d0: number; m0: Point; v0: View } | null>(null);
  // 兩指手勢結束前不再畫框（避免放開時誤畫）
  const gestured = useRef(false);

  /** 相對於畫面區域的座標 */
  const local = (e: { clientX: number; clientY: number }): Point => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  /** 圖片上的相對位置（0–1）；getBoundingClientRect 已含縮放與位移 */
  const imagePoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = contentRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };
  /** 以畫面上的某一點為中心縮放：該點下的圖片內容保持不動 */
  const zoomAround = (from: View, anchor: Point, target: Point, scale: number): View => {
    const content = contentRef.current!;
    const origin = { x: content.offsetLeft, y: content.offsetTop };
    const s = clampScale(scale);
    if (s === 1) return { scale: 1, x: 0, y: 0 };
    const cx = (anchor.x - origin.x - from.x) / from.scale;
    const cy = (anchor.y - origin.y - from.y) / from.scale;
    return { scale: s, x: target.x - origin.x - cx * s, y: target.y - origin.y - cy * s };
  };

  const draftRect = draft && {
    x: Math.min(draft.x0, draft.x1),
    y: Math.min(draft.y0, draft.y1),
    w: Math.abs(draft.x1 - draft.x0),
    h: Math.abs(draft.y1 - draft.y0),
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) {
      gestured.current = false;
      const p = imagePoint(e);
      setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { d0: distance(a, b), m0: midpoint(a, b), v0: view };
      gestured.current = true;
      setDraft(undefined);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    if (gesture.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const { d0, m0, v0 } = gesture.current;
      setView(zoomAround(v0, m0, midpoint(a, b), v0.scale * (distance(a, b) / Math.max(1, d0))));
    } else if (draft && !gestured.current) {
      const p = imagePoint(e);
      setDraft({ ...draft, x1: p.x, y1: p.y });
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size > 0) return;
    // 太小的框多半是誤觸
    if (!gestured.current && draftRect && draftRect.w > 0.01 && draftRect.h > 0.01) onChange([...page.masks, draftRect]);
    setDraft(undefined);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`遮蓋第 ${index + 1} 頁`} className="fixed inset-0 z-50 flex flex-col bg-black pt-safe pb-safe">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <span className="text-sm">
          第 {index + 1} 頁：一指畫框塗黑，兩指縮放、移動
        </span>
        <span className="flex shrink-0 gap-2">
          {view.scale > 1 && (
            <button type="button" onClick={() => setView({ scale: 1, x: 0, y: 0 })} className="rounded-full bg-white/15 px-3 py-1.5 text-sm">
              {Math.round(view.scale * 10) / 10}×
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black">
            完成
          </button>
        </span>
      </div>
      <div
        ref={viewportRef}
        data-testid="mask-viewport"
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={(e) => {
          const p = local(e);
          setView((v) => zoomAround(v, p, p, v.scale * Math.exp(-e.deltaY * 0.002)));
        }}
      >
        <div
          ref={contentRef}
          className="relative"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 本機 blob 預覽 */}
          <img src={page.url} alt={`第 ${index + 1} 頁`} draggable={false} className="block max-h-[calc(100dvh-9rem)] w-auto max-w-[calc(100vw-1rem)]" />
          <Masks masks={draftRect ? [...page.masks, draftRect] : page.masks} editingScale={view.scale} />
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
