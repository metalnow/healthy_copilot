import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toDateTimeLocalValue } from "@/lib/time";
import { saveDrink } from "../../actions";
import { DrinkForm } from "./drink-form";

export const metadata: Metadata = { title: "記錄飲料" };

export default async function DrinkPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <PageHeader title="記錄飲料 / 飲水" />
      <DrinkForm
        action={saveDrink.bind(null, null)}
        defaultOccurredAt={toDateTimeLocalValue(new Date(), user.timezone)}
        aiConfigured={Boolean((await getEnv()).OPENROUTER_API_KEY)}
      />
    </div>
  );
}
