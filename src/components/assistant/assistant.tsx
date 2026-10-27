"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { hasTabBar } from "@/components/nav";
import { ASSISTANT_NAME, pageTip, type AssistantMessage } from "@/lib/assistant";
import { NurseAvatar } from "./nurse-avatar";

// 個人偏好只存在這台裝置（localStorage），讀寫失敗時當作沒有設定
const DISMISSED_KEY = "assistant:dismissed";
const TIPS_KEY = "assistant:tips";
const MINIMIZED_KEY = "assistant:minimized";
const AUTO_OPENED_KEY = "assistant:auto-opened";

const STORAGE_EVENT = "assistant-storage";

function read(storage: () => Storage, key: string): string {
  try {
    return storage().getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    // 無痕模式或停用儲存空間：只影響記憶，不影響使用
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function parse<T>(raw: string, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(STORAGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STORAGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** localStorage 的值（伺服器端與讀取失敗時為預設值）；快照用原始字串，避免每次產生新物件 */
function useStored<T>(key: string, fallback: T): [T, (value: T) => void] {
  const raw = useSyncExternalStore(subscribe, () => read(local, key), () => "");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fallback 只在沒有值時使用
  const value = useMemo(() => parse(raw, fallback), [raw]);
  return [value, useCallback((next: T) => write(local, key, next), [key])];
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

/** 浮動在畫面右下角的助理：對話泡泡顯示提醒與頁面說明 */
export function Assistant() {
  const pathname = usePathname();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [dismissed, setDismissed] = useStored<string[]>(DISMISSED_KEY, []);
  const [seenTips, setSeenTips] = useStored<string[]>(TIPS_KEY, []);
  const [minimized, setMinimized] = useStored<boolean>(MINIMIZED_KEY, false);
  const [open, setOpen] = useState(false);
  const [waving, setWaving] = useState(false);

  // 換頁時重新取得提醒（紀錄、打勾等動作通常會換頁）；
  // 頁面說明與重要提醒在每個工作階段主動打開一次
  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ messages?: AssistantMessage[] }>) : null))
      .then((json) => {
        if (cancelled || !json?.messages) return;
        setMessages(json.messages);
        if (parse(read(local, MINIMIZED_KEY), false)) return;
        const tip = pageTip(pathname);
        const done = [...parse<string[]>(read(local, DISMISSED_KEY), []), ...parse<string[]>(read(local, TIPS_KEY), [])];
        const first = [...(tip ? [tip] : []), ...(hasTabBar(pathname) ? json.messages : [])].find((m) => !done.includes(m.id));
        const opened = parse<string[]>(read(session, AUTO_OPENED_KEY), []);
        if (!first || opened.includes(first.id) || !(first.id.startsWith("tip:") || first.priority >= 50)) return;
        write(session, AUTO_OPENED_KEY, [...opened, first.id]);
        setOpen(true);
        setWaving(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // 分頁首頁顯示所有提醒；表單等子頁面只說明這一頁，避免擋住正在填的內容
  const withTabBar = hasTabBar(pathname);
  const queue = useMemo(() => {
    const tip = pageTip(pathname);
    return [
      ...(tip && !seenTips.includes(tip.id) ? [tip] : []),
      ...(withTabBar ? messages.filter((m) => !dismissed.includes(m.id)) : []),
    ];
  }, [pathname, withTabBar, messages, dismissed, seenTips]);
  const current = queue[0];

  useEffect(() => {
    if (!waving) return;
    const timer = setTimeout(() => setWaving(false), 1800);
    return () => clearTimeout(timer);
  }, [waving]);

  // 提醒都看完時只顯示一下「都看完了」就自動收起
  useEffect(() => {
    if (!open || current) return;
    const timer = setTimeout(() => setOpen(false), 2500);
    return () => clearTimeout(timer);
  }, [open, current]);

  const acknowledge = (message: AssistantMessage) => {
    // 只保留最近 200 筆（id 含日期，舊的自然不會再出現）
    if (message.id.startsWith("tip:")) setSeenTips([...seenTips, message.id]);
    else setDismissed([...dismissed, message.id].slice(-200));
  };

  const setMinimizedPersist = (value: boolean) => {
    setMinimized(value);
    setOpen(!value && queue.length > 0);
  };

  // 子頁面的送出按鈕固定在底部，助理改到右上角、泡泡往下開
  const position = withTabBar
    ? { bottom: "calc(env(safe-area-inset-bottom) + 4.75rem)" }
    : { top: "calc(env(safe-area-inset-top) + 4.25rem)" };
  const mood = open && current ? current.mood : queue.length > 0 ? "smile" : "happy";

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimizedPersist(false)}
        aria-label={`叫出助理${ASSISTANT_NAME}${queue.length ? `（${queue.length} 則提醒）` : ""}`}
        className="fixed right-0 z-30 flex h-14 w-9 items-start overflow-hidden rounded-l-2xl border border-r-0 border-border bg-surface shadow-md print:hidden"
        style={position}
      >
        <NurseAvatar mood="smile" className="-ml-1 w-14 shrink-0" />
        {queue.length > 0 && <span className="absolute top-1 left-1 size-2.5 rounded-full bg-red-500" />}
      </button>
    );
  }

  return (
    <div
      className={`pointer-events-none fixed right-3 z-30 flex items-end gap-1 print:hidden ${withTabBar ? "flex-col" : "flex-col-reverse"}`}
      style={position}
    >
      {open && (
        <div
          role="status"
          aria-live="polite"
          className="assistant-bubble pointer-events-auto relative mr-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-3 shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
            <span className="font-medium text-accent">
              {ASSISTANT_NAME}
              {queue.length > 1 && <span className="ml-1.5 font-normal text-muted">1 / {queue.length}</span>}
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label="收起對話" className="-m-1 p-1">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {current ? (
            <>
              <p className="text-sm leading-relaxed">{current.text}</p>
              <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => acknowledge(current)} className="rounded-full px-3 py-1.5 text-sm text-muted active:bg-border/60">
                  {queue.length > 1 ? "下一則" : "知道了"}
                </button>
                {current.href && current.href !== pathname && (
                  <Link
                    href={current.href}
                    onClick={() => {
                      acknowledge(current);
                      setOpen(false);
                    }}
                    className="rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground active:scale-95"
                  >
                    {current.action ?? "前往"}
                  </Link>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm leading-relaxed">今天的提醒都看完了，有需要隨時點我喔～</p>
          )}
          <button type="button" onClick={() => setMinimizedPersist(true)} className="mt-1 text-xs text-muted underline-offset-2 hover:underline">
            先把{ASSISTANT_NAME}收到旁邊
          </button>
          {/* 泡泡的尾巴，指向助理 */}
          <span
            aria-hidden
            className={`absolute size-3 rotate-45 border-border bg-surface ${
              withTabBar ? "-bottom-1.5 right-7 border-r border-b" : "-top-1.5 right-4 border-t border-l"
            }`}
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setWaving(true);
        }}
        aria-expanded={open}
        aria-label={`助理${ASSISTANT_NAME}${queue.length ? `：${queue.length} 則提醒` : ""}`}
        className={`pointer-events-auto relative active:scale-95 ${waving ? "nurse-waving" : ""}`}
      >
        <span className="nurse-float block">
          <NurseAvatar mood={mood} className={`drop-shadow-md ${withTabBar ? "w-16" : "w-11"}`} />
        </span>
        {!open && queue.length > 0 && (
          <span className="absolute top-0 right-0 flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {queue.length}
          </span>
        )}
      </button>
    </div>
  );
}
