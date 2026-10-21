import { describe, expect, it } from "vitest";
import { chunkForInsert } from "./batch";
import { foodItems } from "./schema";

describe("chunkForInsert", () => {
  it("每批的參數數量不超過 100", () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ i }));
    const chunks = chunkForInsert(foodItems, rows);
    expect(chunks.flat()).toHaveLength(25);
    // food_items 有 10 個欄位 → 每批最多 10 列
    expect(Math.max(...chunks.map((c) => c.length))).toBe(10);
  });

  it("空陣列回傳空批次", () => {
    expect(chunkForInsert(foodItems, [])).toEqual([]);
  });
});
