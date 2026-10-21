"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { formString, type ActionState } from "@/lib/form";
import { parseMedicationForm } from "@/lib/medication/form";
import {
  createMedication,
  deleteMedication,
  setMedicationActive,
  updateMedication,
} from "@/server/medications";

export async function saveMedication(
  medicationId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseMedicationForm(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const db = await getDb();
  if (medicationId) {
    const updated = await updateMedication(
      db,
      user.id,
      medicationId,
      parsed.medication,
      parsed.schedules,
    );
    if (!updated) return { error: "找不到這個藥物" };
    await recordAudit(db, { userId: user.id, action: "medication.update", entityId: medicationId });
  } else {
    const id = await createMedication(db, user.id, parsed.medication, parsed.schedules);
    await recordAudit(db, { userId: user.id, action: "medication.create", entityId: id });
  }
  redirect("/medications");
}

export async function toggleMedicationActive(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return;
  const active = formString(formData, "active") === "true";

  const db = await getDb();
  if (await setMedicationActive(db, user.id, id, active)) {
    await recordAudit(db, {
      userId: user.id,
      action: active ? "medication.activate" : "medication.deactivate",
      entityId: id,
    });
  }
  revalidatePath("/medications");
}

export async function removeMedication(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return;

  const db = await getDb();
  if (await deleteMedication(db, user.id, id)) {
    await recordAudit(db, { userId: user.id, action: "medication.delete", entityId: id });
  }
  redirect("/medications");
}
