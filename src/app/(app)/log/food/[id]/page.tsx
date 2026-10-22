import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDb, getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { toDateTimeLocalValue } from "@/lib/time";
import { getFoodEvent } from "@/server/food";
import { getLastMeal, saveFood } from "../../../actions";
import { FoodForm } from "../food-form";

export const metadata: Metadata = { title: "修改飲食" };

export default async function EditFoodPage({ params }: PageProps<"/log/food/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const event = await getFoodEvent(await getDb(), user.id, id);
  if (!event) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="修改飲食" backHref="/timeline" backLabel="時間軸" />
      <FoodForm
        action={saveFood.bind(null, event.id)}
        getLastMeal={getLastMeal}
        defaultMealType={event.mealType}
        defaultOccurredAt={toDateTimeLocalValue(new Date(event.occurredAt), user.timezone)}
        recentNames={[]}
        aiConfigured={Boolean((await getEnv()).OPENROUTER_API_KEY)}
        defaults={{
          items: event.items.map((i) => ({ name: i.name, portion: i.portion ?? undefined, nutrition: i.nutrition ?? undefined })),
          note: event.note ?? undefined,
        }}
      />
    </div>
  );
}
