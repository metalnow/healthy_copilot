// 送給 AI 之前移除報告文字中的個人身分資料。瀏覽器與伺服器共用（伺服器端會再做一次）。

/** 欄位名稱後面的值會被移除 */
const IDENTITY_LABELS = [
  "姓名",
  "生日",
  "出生日期",
  "出生年月日",
  "身分證字號",
  "身分證號",
  "身分證",
  "身份證字號",
  "身份證號",
  "病歷號碼",
  "病歷號",
  "病例號",
  "工號",
  "員工編號",
  "健康編號",
  "檢體編號",
  "醫師姓名",
  "醫[ \\t\\u3000]*師",
  "客戶名稱",
  "公司名稱",
  "分公司[／/]廠別",
  "部門名稱",
  "部門",
  "職稱",
  "聯絡人",
  "地址",
  "住址",
  "電話",
  "手機",
  "Email",
  "E-mail",
];

/** 欄位名稱不是值：遇到時代表前一個欄位是空的，不要誤刪（也不能吃掉下一個欄位） */
const FIELD_NAMES = [...IDENTITY_LABELS, "性別", "年齡", "檢查日期", "體檢日期", "單位", "關聯員工"].join("|");

/** 同一行內的空白（不跨行，避免空欄位吃掉下一行的內容） */
const SPACE = " \\t\\u3000";

const LABEL_PATTERN = new RegExp(
  `(^|[${SPACE}|｜])(${IDENTITY_LABELS.join("|")})([${SPACE}]*[:：][${SPACE}]*|[${SPACE}]+)(?!(?:${FIELD_NAMES})(?:[:：\\s]|$))([^\\s|｜]+)`,
  "gm",
);

const PATTERNS: { name: string; regex: RegExp }[] = [
  // 身分證字號（含部分遮蔽，例如 T1******44）
  { name: "身分證字號", regex: /\b[A-Z][12*＊][0-9*＊]{8}\b/g },
  { name: "電子郵件", regex: /[\w.+-]+@[\w-]+(\.[\w-]+)+/g },
  { name: "電話", regex: /\b0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4}\b|\b09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/g },
];

export const REDACTED = "［已移除］";

export type IdentityHints = {
  /** 使用者的姓名（任何出現的地方都移除） */
  names?: (string | null | undefined)[];
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 回傳移除身分資料後的文字，以及移除了哪些欄位（給使用者確認） */
export function redactIdentity(text: string, hints: IdentityHints = {}): { text: string; removed: string[] } {
  const removed = new Set<string>();

  let result = text.replace(LABEL_PATTERN, (match, lead: string, label: string, sep: string, value: string) => {
    if (value === REDACTED) return match;
    removed.add(label.replace(/\s+/g, ""));
    return `${lead}${label}${sep}${REDACTED}`;
  });

  for (const { name, regex } of PATTERNS) {
    result = result.replace(regex, () => {
      removed.add(name);
      return REDACTED;
    });
  }

  for (const name of hints.names ?? []) {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < 2) continue;
    const regex = new RegExp(escape(trimmed), "gi");
    if (regex.test(result)) {
      removed.add("姓名");
      result = result.replace(regex, REDACTED);
    }
  }

  return { text: result, removed: [...removed] };
}
