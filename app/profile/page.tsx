import { connection } from "next/server";

import { ProfileForm } from "@/components/profile-form";
import { getTranslator } from "@/lib/i18n/server";

// A separate function, so it needs its own translator.
export async function generateMetadata() {
  const { t } = await getTranslator();

  return {
    title: t("account.metaTitle"),
    description: t("account.metaDescription"),
  };
}

export default async function ProfilePage() {
  await connection();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <ProfileForm />
    </div>
  );
}
