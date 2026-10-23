import type { LabExtraction } from "@/lib/ai/schemas";

/**
 * 分批擷取（每批幾頁）的結果合併成一份：日期與院所取第一個有值的，
 * 項目依序串接，同一項目同一結果只保留一筆（跨頁重複列出時）。
 */
export function mergeLabExtractions(parts: LabExtraction[]): LabExtraction {
  const seen = new Set<string>();
  const items = parts.flatMap((p) => p.items).filter((item) => {
    const key = `${item.code}|${item.displayName}|${item.value ?? item.textValue ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const notes = [...new Set(parts.map((p) => p.notes?.trim()).filter((n): n is string => Boolean(n)))];
  return {
    isHealthReport: parts.some((p) => p.isHealthReport),
    reportDate: parts.find((p) => p.reportDate)?.reportDate ?? null,
    institution: parts.find((p) => p.institution)?.institution ?? null,
    items,
    notes: notes.length ? notes.join("；") : null,
  };
}

/** 依頁數切成批次 */
export function chunkPages<T>(pages: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < pages.length; i += size) chunks.push(pages.slice(i, i + size));
  return chunks;
}
