// 瀏覽器端的 PDF 處理（pdf.js）：抽出文字層，或把每一頁轉成圖片。

/** 每頁平均少於這麼多字，視為掃描檔（沒有文字層） */
const MIN_CHARS_PER_PAGE = 80;

async function openPdf(file: File) {
  // legacy build 內含新語法的 polyfill（例如 Map.getOrInsertComputed），舊一點的手機瀏覽器也能用
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
}

type TextItem = { str: string; x: number; y: number; width: number };

/** 依座標把文字排回一行一行（類似 pdftotext -layout），表格的欄位以空白分隔 */
function layoutLines(items: TextItem[]) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].y - item.y) <= 2) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => {
    let text = "";
    let end: number | null = null;
    for (const item of line.sort((a, b) => a.x - b.x)) {
      if (end !== null && item.x - end > 2) text += item.x - end > 15 ? "   " : " ";
      text += item.str;
      end = item.x + item.width;
    }
    return text;
  });
}

/** 抽出文字層；沒有文字層（掃描檔）時回傳 null */
export async function extractPdfText(file: File): Promise<{ text: string; pages: number } | null> {
  const loading = await openPdf(file);
  try {
    const doc = await loading.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items.flatMap((i) =>
        "str" in i && i.str.trim() ? [{ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width }] : [],
      );
      pages.push(layoutLines(items).join("\n"));
      page.cleanup();
    }
    const chars = pages.join("").replace(/\s/g, "").length;
    if (chars / doc.numPages < MIN_CHARS_PER_PAGE) return null;
    return { text: pages.map((p, i) => `--- 第 ${i + 1} 頁 ---\n${p}`).join("\n\n"), pages: doc.numPages };
  } finally {
    await loading.destroy();
  }
}

/** 把 PDF 每一頁轉成 JPEG（掃描檔改以圖片上傳，才能先塗黑身分資料） */
export async function pdfToImages(file: File, { maxPages, maxSide = 2400, quality = 0.85 }: { maxPages: number; maxSide?: number; quality?: number }) {
  const loading = await openPdf(file);
  try {
    const doc = await loading.promise;
    if (doc.numPages > maxPages) throw new Error(`這份 PDF 有 ${doc.numPages} 頁，轉成圖片最多 ${maxPages} 頁`);
    const images: File[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, maxSide / Math.max(base.width, base.height)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("無法轉換 PDF 頁面"))), "image/jpeg", quality),
      );
      images.push(new File([blob], `page-${n}.jpg`, { type: "image/jpeg" }));
      page.cleanup();
    }
    return images;
  } finally {
    await loading.destroy();
  }
}
