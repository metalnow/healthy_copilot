import type { LabExtraction } from "@/lib/ai/schemas";
import { canonicalLabName, inferLabCode } from "./catalog";

/**
 * 分批擷取（每批幾頁）的結果合併成一份：日期與院所取第一個有值的，
 * 項目依序串接，同一項目同一結果只保留一筆（跨頁重複列出時）。
 */
export function mergeLabExtractions(parts: LabExtraction[]): LabExtraction {
  const seen = new Set<string>();
  const items: LabExtraction["items"] = [];
  const imaging = new Map<string, LabExtraction["items"][number]>();
  for (const item of parts.flatMap((p) => p.items)) {
    const code = inferLabCode(item.code, item.displayName);
    // 超音波同一部位只留一筆（跨頁出現「腹部超音波(ABD Ultrasound)」與「腹部超音波」時），保留較完整的描述
    if (code === "ULTRASOUND") {
      const site = canonicalLabName(code, item.displayName);
      const existing = imaging.get(site);
      if (existing) {
        if ((item.textValue ?? "").length > (existing.textValue ?? "").length) Object.assign(existing, item);
        continue;
      }
      const copy = { ...item };
      imaging.set(site, copy);
      items.push(copy);
      continue;
    }
    const key = `${code}|${item.displayName}|${item.value ?? item.textValue ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  const followUpKeys = new Set<string>();
  const followUps = parts
    .flatMap((p) => p.followUps ?? [])
    .filter((f) => {
      const key = `${f.finding.trim()}|${f.action.trim()}`;
      if (followUpKeys.has(key)) return false;
      followUpKeys.add(key);
      return true;
    });
  const notes = [...new Set(parts.map((p) => p.notes?.trim()).filter((n): n is string => Boolean(n)))];
  return {
    isHealthReport: parts.some((p) => p.isHealthReport),
    reportDate: parts.find((p) => p.reportDate)?.reportDate ?? null,
    institution: parts.find((p) => p.institution)?.institution ?? null,
    items,
    followUps,
    notes: notes.length ? notes.join("；") : null,
  };
}

/** 依頁數切成批次 */
export function chunkPages<T>(pages: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < pages.length; i += size) chunks.push(pages.slice(i, i + size));
  return chunks;
}
