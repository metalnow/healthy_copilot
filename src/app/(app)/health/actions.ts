"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, getEnv } from "@/db";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { formNumber, formString, type ActionState } from "@/lib/form";
import { getGoalMetric } from "@/lib/goals";
import { getLabDefinition } from "@/lib/labs/catalog";
import { ConfirmLabsSchema, LabDraftItemSchema } from "@/lib/labs/review";
import { retryHealthReport } from "@/server/ai/reports";
import {
  addManualLab,
  confirmLabReport,
  createGoal,
  currentMetricValue,
  deleteGoal,
  deleteHealthDocument,
  deleteLab,
  saveHealthProfile,
  setGoalStatus,
} from "@/server/health";

export async function confirmLabs(input: unknown): Promise<{ error: string }> {
  const user = await requireUser();
  const parsed = ConfirmLabsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const row = issue?.path[0] === "items" && typeof issue.path[1] === "number" ? `第 ${issue.path[1] + 1} 列：` : "";
    return { error: `${row}${issue?.message ?? "內容不正確"}` };
  }
  const db = await getDb();
  const error = await confirmLabReport(db, user, parsed.data);
  if (error) return { error };
  await recordAudit(db, {
    userId: user.id,
    action: "health_document.confirm",
    entityId: parsed.data.documentId,
    metadata: { items: parsed.data.items.length },
  });
  redirect(`/health/reports/${parsed.data.documentId}`);
}

export async function deleteReport(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return;
  const db = await getDb();
  if (await deleteHealthDocument(db, (await getEnv()).MEDIA, user.id, id)) {
    await recordAudit(db, { userId: user.id, action: "health_document.delete", entityId: id });
  }
  redirect("/health/reports");
}

export async function retryReport(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return;
  await retryHealthReport(await getDb(), await getEnv(), user.id, id);
  revalidatePath(`/health/reports/${id}`);
}

export async function saveManualLab(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const code = formString(formData, "code") ?? "";
  const def = getLabDefinition(code);
  const measuredAt = z.iso.date().safeParse(formString(formData, "measuredAt"));
  const item = LabDraftItemSchema.safeParse({
    code,
    displayName: code === "OTHER" ? formString(formData, "displayName") : def?.name,
    value: formNumber(formData, "value"),
    textValue: formString(formData, "textValue"),
    unit: formString(formData, "unit"),
    referenceMin: formNumber(formData, "referenceMin"),
    referenceMax: formNumber(formData, "referenceMax"),
  });

  const fieldErrors: Record<string, string> = {};
  if (!def) fieldErrors.code = "請選擇檢驗項目";
  if (!measuredAt.success) fieldErrors.measuredAt = "請輸入檢查日期";
  if (!item.success) {
    for (const issue of item.error.issues) {
      const key = String(issue.path[0] ?? "value");
      fieldErrors[key] ??= key === "displayName" ? "請輸入項目名稱" : issue.message;
    }
  }
  if (!item.success || !measuredAt.success || !def) return { fieldErrors };

  const db = await getDb();
  const id = await addManualLab(db, user.id, item.data, measuredAt.data);
  await recordAudit(db, { userId: user.id, action: "lab_observation.create", entityId: id });
  redirect("/health");
}

export async function removeLab(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return;
  const db = await getDb();
  if (await deleteLab(db, user.id, id)) {
    await recordAudit(db, { userId: user.id, action: "lab_observation.delete", entityId: id });
  }
  revalidatePath("/health");
}

export async function saveProfile(_prev: ActionState & { saved?: boolean }, formData: FormData) {
  const user = await requireUser();
  const list = (key: string) =>
    (formString(formData, key) ?? "")
      .split(/[,，、\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50)
      .map((s) => s.slice(0, 50));

  const parsed = z
    .object({
      sex: z.enum(["male", "female", "other"]).optional(),
      birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
      heightCm: z.number().min(50).max(250).optional(),
      note: z.string().max(2000).optional(),
    })
    .safeParse({
      sex: formString(formData, "sex"),
      birthYear: formNumber(formData, "birthYear"),
      heightCm: formNumber(formData, "heightCm"),
      note: formString(formData, "note"),
    });
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0]);
    const hints: Record<string, string> = {
      birthYear: "出生年請輸入西元年",
      heightCm: "身高請輸入 50–250 cm",
    };
    return { error: hints[field] ?? "內容不正確" };
  }

  const db = await getDb();
  await saveHealthProfile(db, user.id, {
    sex: parsed.data.sex ?? null,
    birthYear: parsed.data.birthYear ?? null,
    heightCm: parsed.data.heightCm ?? null,
    note: parsed.data.note ?? null,
    allergies: list("allergies"),
    conditions: list("conditions"),
  });
  await recordAudit(db, { userId: user.id, action: "health_profile.update" });
  revalidatePath("/health");
  return { saved: true };
}

export async function saveGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const metric = getGoalMetric(formString(formData, "metric") ?? "");
  const target = formNumber(formData, "targetValue");
  const targetDate = formString(formData, "targetDate");

  const fieldErrors: Record<string, string> = {};
  if (!metric) fieldErrors.metric = "請選擇指標";
  if (target === undefined || Number.isNaN(target)) fieldErrors.targetValue = "請輸入目標值";
  if (targetDate && !z.iso.date().safeParse(targetDate).success) fieldErrors.targetDate = "日期格式不正確";
  if (!metric || target === undefined || Number.isNaN(target) || fieldErrors.targetDate) return { fieldErrors };

  const db = await getDb();
  const baselineInput = formNumber(formData, "baselineValue");
  const baseline =
    baselineInput !== undefined && !Number.isNaN(baselineInput)
      ? baselineInput
      : ((await currentMetricValue(db, user, metric.code))?.value ?? null);

  const id = await createGoal(db, user.id, {
    metric: metric.code,
    unit: metric.unit,
    baselineValue: baseline,
    targetValue: target,
    targetDate,
  });
  await recordAudit(db, { userId: user.id, action: "health_goal.create", entityId: id });
  redirect("/health/goals");
}

/** 採用建議目標：沿用新增目標的驗證與寫入 */
export async function adoptGoal(formData: FormData) {
  const result = await saveGoal({}, formData);
  // 驗證失敗（例如建議已過期）時回到目標頁
  if (result.fieldErrors || result.error) redirect("/health/goals");
}

export async function updateGoal(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const action = formString(formData, "action");
  if (!id) return;
  const db = await getDb();
  if (action === "delete") {
    if (await deleteGoal(db, user.id, id)) await recordAudit(db, { userId: user.id, action: "health_goal.delete", entityId: id });
  } else if (action === "active" || action === "paused" || action === "achieved") {
    if (await setGoalStatus(db, user.id, id, action)) {
      await recordAudit(db, { userId: user.id, action: `health_goal.${action}`, entityId: id });
    }
  }
  revalidatePath("/health/goals");
}
