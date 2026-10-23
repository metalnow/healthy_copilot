import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb, getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toDateTimeLocalValue } from "@/lib/time";
import { abvFromAlcohol, getDrinkEvent } from "@/server/food";
import { saveDrink } from "../../../actions";
import { DrinkForm } from "../drink-form";

export const metadata: Metadata = { title: "修改飲料" };

export default async function EditDrinkPage({ params }: PageProps<"/log/drink/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const drink = await getDrinkEvent(await getDb(), user.id, id);
  if (!drink) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="修改飲料" backHref="/timeline" backLabel="時間軸" />
      <DrinkForm
        action={saveDrink.bind(null, drink.id)}
        defaultOccurredAt={toDateTimeLocalValue(new Date(drink.occurredAt), user.timezone)}
        defaults={{
          drinkType: drink.drinkType,
          name: drink.name ?? undefined,
          volumeMl: drink.volumeMl ?? undefined,
          abvPercent: abvFromAlcohol(drink.alcoholG, drink.volumeMl),
          nutrition: drink.nutrition ?? undefined,
        }}
        aiConfigured={Boolean((await getEnv()).OPENROUTER_API_KEY)}
      />
      {(drink.caffeineMg !== null || drink.sugarG !== null || drink.nutrition?.kcal !== undefined) && (
        <p className="text-xs text-muted">沒有修改熱量時，咖啡因、糖與熱量的估算值會依修改後的容量等比例調整；改變類型則會清除。</p>
      )}
    </div>
  );
}
