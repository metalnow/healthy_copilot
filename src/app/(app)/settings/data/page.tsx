import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getDb, getEnv } from "@/db";
import { userSettings } from "@/db/schema";
import { requireUser } from "@/lib/auth/dal";
import { backupHistory, KEEP_BACKUPS, listDriveBackups } from "@/server/backup";
import { getDriveClient, isDriveConnected } from "@/server/google-drive";
import {
  backupNow,
  deleteAccountAction,
  disconnectDriveAction,
  revealRecoveryKey,
  updateBackupSettings,
} from "./actions";
import { DeleteAccountForm } from "./delete-account-form";
import { RecoveryKey } from "./recovery-key";
import { RestorePanel } from "./restore-panel";

export const metadata: Metadata = { title: "資料與備份" };

const FREQUENCY_LABELS = { off: "關閉", daily: "每天", weekly: "每週（週一）", monthly: "每月（1 日）" } as const;

const DRIVE_MESSAGES: Record<string, { text: string; ok?: boolean }> = {
  connected: { text: "已連結 Google Drive。", ok: true },
  wrong_account: { text: "請使用與登入相同的 Google 帳號授權。" },
  scope_denied: { text: "沒有取得 Google Drive 權限，請重新連結並勾選允許。" },
  failed: { text: "連結 Google Drive 失敗，請再試一次。" },
  invalid_state: { text: "授權流程已過期，請再試一次。" },
};

const BACKUP_MESSAGES: Record<string, { text: string; ok?: boolean }> = {
  ok: { text: "備份完成。", ok: true },
  drive_not_connected: { text: "Google Drive 授權已失效，請重新連結。" },
  backup_failed: { text: "備份失敗，請稍後再試。" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ message }: { message?: { text: string; ok?: boolean } }) {
  if (!message) return null;
  return (
    <p role="status" className={`rounded-lg px-3 py-2 text-sm ${message.ok ? "bg-accent/10 text-accent" : "border border-warning/40 text-warning"}`}>
      {message.text}
    </p>
  );
}

export default async function DataSettingsPage({ searchParams }: PageProps<"/settings/data">) {
  const user = await requireUser();
  const params = await searchParams;
  const db = await getDb();
  const env = await getEnv();

  const [[settings], connected, history] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, user.id)).limit(1),
    isDriveConnected(db, user.id),
    backupHistory(db, user.id, 5),
  ]);

  let driveBackups: { id: string; name: string; createdTime?: string; size?: string }[] | null = null;
  let driveError = false;
  if (connected) {
    try {
      driveBackups = await listDriveBackups(await getDriveClient(db, env, user.id));
    } catch {
      driveError = true;
    }
  }

  const tz = user.timezone;
  const notice =
    (typeof params.drive === "string" && DRIVE_MESSAGES[params.drive]) ||
    (typeof params.backup === "string" && BACKUP_MESSAGES[params.backup]) ||
    undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="資料與備份" backHref="/settings" backLabel="設定" />
      <Notice message={notice} />

      <Section title="Google Drive 備份">
        <p className="text-sm text-muted">
          備份會加密後存到你的 Google Drive「Personal Health Copilot」資料夾。App 只能存取它自己建立的檔案，保留最近 {KEEP_BACKUPS} 份。
        </p>
        {connected ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-accent">已連結</span>
              <form action={backupNow}>
                <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-foreground">
                  立即備份
                </button>
              </form>
              <form action={disconnectDriveAction}>
                <button type="submit" className="text-sm text-muted">
                  取消連結
                </button>
              </form>
            </div>
            {driveError && <p className="text-sm text-warning">無法讀取 Google Drive，授權可能已失效，請取消連結後重新連結。</p>}
          </>
        ) : (
          <a
            href="/api/google/drive/connect"
            className="inline-block rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground"
          >
            連結 Google Drive
          </a>
        )}

        <form action={updateBackupSettings} className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <label className="space-y-1 text-sm">
            <span className="block text-muted">自動備份</span>
            <select
              name="frequency"
              defaultValue={settings?.backupFrequency ?? "weekly"}
              className="rounded-lg border border-border bg-surface px-2 py-1.5"
            >
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-1.5 text-sm">
            <input type="checkbox" name="includeMedia" defaultChecked={settings?.backupIncludeMedia ?? false} className="size-4 accent-accent" />
            包含照片與報告原始檔（上限 50 MB）
          </label>
          <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm">
            儲存設定
          </button>
        </form>

        {history.length > 0 && (
          <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted">
            {history.map((b) => (
              <li key={b.id}>
                {b.createdAt.toLocaleString("zh-TW", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}・
                {b.trigger === "manual" ? "手動" : "自動"}・
                {b.status === "succeeded" ? "成功" : b.status === "failed" ? "失敗" : "進行中"}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="還原">
        <RestorePanel driveBackups={driveBackups} timeZone={tz} />
      </Section>

      <Section title="復原金鑰">
        <p className="text-sm text-muted">
          備份以你的專屬金鑰加密。請把復原金鑰另外保存：伺服器金鑰遺失、或在新帳號還原舊備份時，需要它才能解開備份。
        </p>
        <RecoveryKey reveal={revealRecoveryKey} />
      </Section>

      <Section title="匯出資料">
        <p className="text-sm text-muted">下載所有資料（JSON，未加密的 ZIP），可自行保存或攜帶到其他服務。</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <a href="/api/backup/export" className="rounded-lg border border-border px-3 py-1.5">
            匯出資料
          </a>
          <a href="/api/backup/export?media=1" className="rounded-lg border border-border px-3 py-1.5">
            匯出資料與原始檔
          </a>
        </div>
      </Section>

      <Section title="刪除帳號">
        <p className="text-sm text-muted">
          永久刪除帳號、所有健康紀錄與上傳的原始檔，並撤銷 Google Drive 授權。Google Drive 上既有的備份檔不會被刪除。
        </p>
        <DeleteAccountForm action={deleteAccountAction} email={user.email} />
      </Section>
    </div>
  );
}
