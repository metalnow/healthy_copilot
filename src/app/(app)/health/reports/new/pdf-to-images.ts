/**
 * 在瀏覽器把 PDF 每一頁轉成 JPEG。
 * 用於超過上傳上限的 PDF（多半是手機拍照合成的掃描檔），轉成圖片後以「多張圖片」上傳。
 */
export async function pdfToImages(file: File, { maxPages, maxSide = 2400, quality = 0.85 }: { maxPages: number; maxSide?: number; quality?: number }) {
  // legacy build 內含新語法的 polyfill（例如 Map.getOrInsertComputed），舊一點的手機瀏覽器也能用
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
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
