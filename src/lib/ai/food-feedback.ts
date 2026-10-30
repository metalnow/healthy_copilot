// 從使用者對照片辨識結果的修正中整理出個人化提示（in-context learning）：
// 比對 AI 原本的品項與使用者確認、修改後實際存下的品項，下次辨識時附在提示中參考。
// 不訓練模型，也不包含任何身分資訊；只有品名、份量與次數。

export type FeedbackItem = { name: string; portion: string | null; inferred?: boolean };

export type FeedbackSample = {
  /** AI 辨識出的品項 */
  ai: FeedbackItem[];
  /** 使用者確認（或之後修改）後存下的品項 */
  saved: FeedbackItem[];
  /** 使用者當時的補充說明 */
  note?: string | null;
};

const normalize = (name: string) => name.replace(/\s+/g, "").toLowerCase();
const short = (text: string, max = 20) => (text.length > max ? `${text.slice(0, max)}…` : text);

function sameFood(a: string, b: string) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x)));
}

function topCounts(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, n]) => `${short(name)}（${n} 次）`)
    .join("、");
}

/** 與份量、容器、下方內容有關的補充說明才值得記住 */
const USEFUL_NOTE = /碗|盤|底|下面|下層|份量|一半|半碗|大碗|小碗|加飯|加麵|沒有飯|沒有麵/;

export function summarizeFoodFeedback(samples: FeedbackSample[]): string[] {
  const missed = new Map<string, number>();
  const removed = new Map<string, number>();
  const portions: string[] = [];
  const notes: string[] = [];
  let inferredKept = 0;
  let inferredRemoved = 0;

  for (const sample of samples) {
    const matched = new Set<number>();
    for (const saved of sample.saved) {
      const index = sample.ai.findIndex((ai, i) => !matched.has(i) && sameFood(ai.name, saved.name));
      if (index === -1) {
        missed.set(saved.name, (missed.get(saved.name) ?? 0) + 1);
        continue;
      }
      matched.add(index);
      const ai = sample.ai[index];
      if (ai.inferred) inferredKept++;
      if (ai.portion && saved.portion && normalize(ai.portion) !== normalize(saved.portion) && portions.length < 5) {
        portions.push(`「${short(saved.name)}」AI 估「${short(ai.portion, 15)}」，使用者改成「${short(saved.portion, 15)}」`);
      }
    }
    sample.ai.forEach((ai, i) => {
      if (matched.has(i)) return;
      if (ai.inferred) inferredRemoved++;
      else removed.set(ai.name, (removed.get(ai.name) ?? 0) + 1);
    });
    const note = sample.note?.trim();
    if (note && USEFUL_NOTE.test(note) && notes.length < 3) notes.push(`「${short(note, 40)}」`);
  }

  const lines: string[] = [];
  if (missed.size > 0) lines.push(`照片中常被漏掉、使用者自行補上：${topCounts(missed, 5)}`);
  if (removed.size > 0) lines.push(`曾被誤判、使用者刪除：${topCounts(removed, 5)}`);
  if (inferredKept + inferredRemoved > 0) {
    const verdict =
      inferredRemoved > inferredKept ? "多半其實沒有，推測時要保守" : inferredKept > inferredRemoved ? "多半正確" : "對錯各半";
    lines.push(`推測容器下方的主食：使用者保留 ${inferredKept} 次、刪除 ${inferredRemoved} 次（${verdict}）`);
  }
  if (portions.length > 0) lines.push(`份量修正：${portions.join("；")}`);
  if (notes.length > 0) lines.push(`使用者曾補充：${notes.join("、")}`);
  return lines;
}

/** 組成送給模型的個人化說明；沒有內容時回傳 null */
export function personalFoodContext(input: { hints: string | null; learned: string[] }) {
  const parts: string[] = [];
  const hints = input.hints?.trim();
  if (hints) parts.push(`使用者自己寫的飲食習慣：${hints.slice(0, 500)}`);
  if (input.learned.length > 0) parts.push(`使用者過去的修正：\n${input.learned.map((l) => `- ${l}`).join("\n")}`);
  return parts.length > 0 ? parts.join("\n") : null;
}
