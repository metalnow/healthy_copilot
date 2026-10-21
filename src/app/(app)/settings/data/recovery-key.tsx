"use client";

import { useState, useTransition } from "react";

export function RecoveryKey({ reveal }: { reveal: () => Promise<string> }) {
  const [key, setKey] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!key) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm("復原金鑰可以解開你所有的備份，請存放在密碼管理器等安全的地方，不要分享給任何人。要顯示嗎？")) {
            startTransition(async () => setKey(await reveal()));
          }
        }}
        className="rounded-lg border border-border px-3 py-1.5 text-sm"
      >
        {pending ? "載入中…" : "顯示復原金鑰"}
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <code className="block break-all rounded-lg bg-background p-3 text-xs">{key}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(key);
          setCopied(true);
        }}
        className="rounded-lg border border-border px-3 py-1.5 text-sm"
      >
        {copied ? "已複製" : "複製"}
      </button>
    </div>
  );
}
