import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/dal";
import { getHealthProfile } from "@/server/health";
import { saveProfile } from "../actions";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "基本資料" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getHealthProfile(await getDb(), user.id);
  return (
    <div className="space-y-6">
      <PageHeader title="基本資料" backHref="/health" backLabel="健康" />
      <ProfileForm
        action={saveProfile}
        defaults={{
          sex: profile?.sex ?? null,
          birthYear: profile?.birthYear ?? null,
          heightCm: profile?.heightCm ?? null,
          allergies: profile?.allergies ?? [],
          conditions: profile?.conditions ?? [],
          note: profile?.note ?? null,
        }}
      />
    </div>
  );
}
