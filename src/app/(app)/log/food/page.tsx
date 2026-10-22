import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getDb, getEnv } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { guessMealType } from "@/lib/ai/draft";
import { toDateTimeLocalValue, toLocalTime } from "@/lib/time";
import { recentFoodNames } from "@/server/food";
import { getLastMeal, saveFood } from "../../actions";
import { FoodForm } from "./food-form";

export const metadata: Metadata = { title: "記錄飲食" };

export default async function FoodPage() {
  const user = await requireUser();
  const now = new Date();
  const recentNames = await recentFoodNames(await getDb(), user.id);

  return (
    <div className="space-y-6">
      <PageHeader title="記錄飲食" />
      <FoodForm
        action={saveFood.bind(null, null)}
        getLastMeal={getLastMeal}
        defaultMealType={guessMealType(toLocalTime(now, user.timezone))}
        defaultOccurredAt={toDateTimeLocalValue(now, user.timezone)}
        recentNames={recentNames}
        aiConfigured={Boolean((await getEnv()).OPENROUTER_API_KEY)}
      />
    </div>
  );
}
