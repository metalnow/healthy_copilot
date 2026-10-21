import { getTableColumns, type Table } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "./client";

/** D1 每個查詢最多 100 個綁定參數 */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * 把多列資料切成不超過 D1 參數上限的批次。
 * Drizzle 的多列 insert 會帶入資料表的每個欄位，所以以欄位數計算。
 */
export function chunkForInsert<T>(table: Table, rows: T[]): T[][] {
  const columns = Object.keys(getTableColumns(table)).length;
  const size = Math.max(1, Math.floor(D1_MAX_BOUND_PARAMS / columns));
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

/** 以單一 D1 batch（同一交易）執行數量不固定的語句 */
export async function runBatch(db: Db, statements: BatchItem<"sqlite">[]) {
  if (statements.length === 0) return;
  const [first, ...rest] = statements;
  await db.batch([first, ...rest]);
}
