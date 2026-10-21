// FormData 解析工具

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** 空字串回傳 undefined；無法解析回傳 NaN（交給 Zod 回報錯誤） */
export function formNumber(formData: FormData, key: string): number | undefined {
  const value = formString(formData, key);
  return value === undefined ? undefined : Number(value);
}

export function formStrings(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 把 Zod issue 轉成 { 欄位: 訊息 } */
export function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}
