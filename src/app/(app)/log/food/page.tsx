import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import type { MealType } from "@/lib/enums";
import { toDateTimeLocalValue, toLocalTime } from "@/lib/time";
import { recentFoodNames } from "@/server/food";
import { getLastMeal, saveFood } from "../../actions";
import { FoodForm } from "./food-form";

export const metadata: Metadata = { title: "記錄飲食" };

/** 依當地時刻猜餐別 */
function guessMealType(localTime: string): MealType {
  if (localTime < "10:30") return "breakfast";
  if (localTime < "14:30") return "lunch";
  if (localTime >= "17:00" && localTime < "21:00") return "dinner";
  return "snack";
}

export default async function FoodPage() {
  const user = await requireUser();
  const now = new Date();
  const recentNames = await recentFoodNames(await getDb(), user.id);

  return (
    <div className="space-y-6">
      <PageHeader title="記錄飲食" />
      <FoodForm
        action={saveFood}
        getLastMeal={getLastMeal}
        defaultMealType={guessMealType(toLocalTime(now, user.timezone))}
        defaultOccurredAt={toDateTimeLocalValue(now, user.timezone)}
        recentNames={recentNames}
      />
    </div>
  );
}
