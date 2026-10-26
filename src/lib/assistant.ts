// 助理「小晴」的提醒：依今天的紀錄與追蹤狀態用固定規則產生（不經 AI），由畫面上的對話泡泡顯示。

export type AssistantMood = "smile" | "happy" | "worried" | "think";

export type AssistantMessage = {
  /** 同一天同一件事的 id 固定，使用者按「知道了」後當天不再出現 */
  id: string;
  mood: AssistantMood;
  text: string;
  href?: string;
  action?: string;
  /** 越大越優先；≥ 50 的提醒會主動打開泡泡 */
  priority: number;
};

export const ASSISTANT_NAME = "小晴";

export type AssistantInput = {
  today: string;
  /** 現在的當地時間 HH:mm */
  now: string;
  /** 今天排程中、還沒打勾的用藥 */
  medications: { scheduleId: string; name: string; localTime: string }[];
  /** 進行中的追蹤事項 */
  followUps: { id: string; finding: string; action: string; status: "open" | "scheduled"; dueDate: string | null }[];
  findingSuggestions: number;
  reportsToConfirm: number;
  foodRecordsToday: number;
  /** 最近一次量體重的日期 */
  lastWeightDate: string | null;
  goalSuggestions: number;
};

function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function buildAssistantMessages(input: AssistantInput): AssistantMessage[] {
  const messages: AssistantMessage[] = [];
  const now = minutesOf(input.now);

  // 用藥：到了時間還沒打勾
  const due = input.medications.filter((m) => minutesOf(m.localTime) <= now);
  if (due.length > 0) {
    const late = now - minutesOf(due[0].localTime) >= 60;
    const names = due.slice(0, 2).map((m) => `${m.name}（${m.localTime}）`).join("、");
    messages.push({
      id: `med:${input.today}:${due.map((m) => m.scheduleId).join(",")}`,
      mood: late ? "worried" : "smile",
      text: `該吃藥囉！${names}${due.length > 2 ? ` 等 ${due.length} 項` : ""}還沒打勾，吃完記得勾選～`,
      href: "/",
      action: "去打勾",
      priority: late ? 90 : 80,
    });
  }

  // 追蹤事項：已過建議日期、或一週內要回診
  const overdue = input.followUps.filter((f) => f.dueDate !== null && f.dueDate < input.today);
  if (overdue.length > 0) {
    messages.push({
      id: `followup-overdue:${input.today}:${overdue.map((f) => f.id).join(",")}`,
      mood: "worried",
      text: `「${overdue[0].finding}」已經過了建議追蹤的日期${overdue.length > 1 ? `（還有 ${overdue.length - 1} 項）` : ""}，記得安排回診喔。`,
      href: "/health/follow-ups",
      action: "看追蹤事項",
      priority: 70,
    });
  }
  const soon = input.followUps.find(
    (f) => f.status === "scheduled" && f.dueDate !== null && f.dueDate >= input.today && daysBetween(input.today, f.dueDate) <= 7,
  );
  if (soon?.dueDate) {
    const days = daysBetween(input.today, soon.dueDate);
    messages.push({
      id: `followup-soon:${input.today}:${soon.id}`,
      mood: "smile",
      text: `提醒你，${days === 0 ? "今天" : days === 1 ? "明天" : `${soon.dueDate}（${days} 天後）`}要${soon.action.replace(/[。.]$/, "")}。`,
      href: "/health/follow-ups",
      action: "看追蹤事項",
      priority: days <= 1 ? 75 : 55,
    });
  }

  if (input.reportsToConfirm > 0) {
    messages.push({
      id: `reports:${input.today}:${input.reportsToConfirm}`,
      mood: "think",
      text: `有 ${input.reportsToConfirm} 份健檢報告等你確認，確認後我才能幫你追蹤數值喔。`,
      href: "/health/reports",
      action: "去確認",
      priority: 60,
    });
  }

  if (input.findingSuggestions > 0) {
    messages.push({
      id: `findings:${input.today}:${input.findingSuggestions}`,
      mood: "think",
      text: `健檢報告裡有 ${input.findingSuggestions} 項檢查發現可能需要追蹤，要一起看看嗎？`,
      href: "/health/follow-ups",
      action: "一起看看",
      priority: 45,
    });
  }

  if (input.foodRecordsToday === 0 && now >= 13 * 60) {
    messages.push({
      id: `food:${input.today}`,
      mood: "smile",
      text: "今天還沒記錄飲食喔，拍張照片，我幫你估熱量！",
      href: "/log/ai",
      action: "記錄飲食",
      priority: 40,
    });
  }

  if (input.lastWeightDate === null || daysBetween(input.lastWeightDate, input.today) >= 7) {
    messages.push({
      id: `weight:${input.today}`,
      mood: "smile",
      text: input.lastWeightDate ? "好幾天沒量體重了，明天早上起床、上完廁所量一下吧～" : "要不要記錄一下體重？之後我就能幫你看趨勢喔。",
      href: "/log/measurement/weight",
      action: "記錄體重",
      priority: 30,
    });
  }

  if (input.goalSuggestions > 0) {
    messages.push({
      id: `goals:${input.today}:${input.goalSuggestions}`,
      mood: "happy",
      text: `我依你的健檢報告整理了 ${input.goalSuggestions} 個建議目標，還附上飲食和生活上可以怎麼做。`,
      href: "/health/goals",
      action: "看建議",
      priority: 35,
    });
  }

  return messages.sort((a, b) => b.priority - a.priority);
}

/** 沒有提醒時的招呼 */
export function greeting(now: string): AssistantMessage {
  const hour = Number(now.slice(0, 2));
  const text =
    hour < 5
      ? "這麼晚還沒睡呀？早點休息，睡眠也是健康的一部分喔。"
      : hour < 11
        ? "早安！今天也一起好好照顧身體吧～"
        : hour < 14
          ? "午安！吃飯記得先吃菜和蛋白質，再吃澱粉喔。"
          : hour < 18
            ? "下午好！起來走動一下、喝杯水吧～"
            : "晚安！今天辛苦了，睡前少滑手機會比較好睡喔。";
  return { id: `greeting:${hour < 5 ? "night" : hour < 11 ? "morning" : hour < 14 ? "noon" : hour < 18 ? "afternoon" : "evening"}`, mood: "happy", text, priority: 0 };
}

/** 各頁面的小提示：第一次進到該頁時說明 */
const PAGE_TIPS: { prefix: string; text: string; mood?: AssistantMood }[] = [
  { prefix: "/health/reports/new", text: "上傳前記得把姓名、身分證號塗黑喔，AI 只會看到你處理過的內容。" },
  { prefix: "/health/follow-ups", text: "安排好回診就按「已預約」，日期快到時我會提醒你。" },
  { prefix: "/health/goals", text: "展開「可以怎麼做」，看看飲食和生活上可以調整什麼。" },
  { prefix: "/log/activity", text: "可以直接上傳手錶 App（例如 CASIO LIFE LOG）的截圖，我幫你讀步數。" },
  { prefix: "/log/sleep", text: "手錶或 App 的睡眠截圖也可以直接匯入喔。" },
  { prefix: "/log/ai", text: "照片可以加一句感受，例如「吃完很撐」，分析時更能對照熱量和飽足感。" },
  { prefix: "/nutrition", text: "熱量是 AI 估算值，點進紀錄就可以自己修改喔。" },
  { prefix: "/medications", text: "可以拍藥袋或包裝，我幫你帶入品名和劑量。" },
];

export function pageTip(pathname: string): AssistantMessage | null {
  const tip = PAGE_TIPS.find((t) => pathname.startsWith(t.prefix));
  return tip ? { id: `tip:${tip.prefix}`, mood: tip.mood ?? "smile", text: tip.text, priority: 1 } : null;
}
