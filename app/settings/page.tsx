import { connection } from "next/server";

import { ProfileForm } from "@/components/profile-form";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Account settings.
 *
 * Separate from `/profile` on purpose. That page is the personal space — who you
 * are, how you look, what you have been doing — while this one is the machinery
 * behind it: the address you sign in with, your password, who may see the profile,
 * and the lists shown on it. Mixing the two made both harder to read: a page of
 * identity with a password form in the middle of it.
 *
 * Both surfaces render the same component (`variant`), so the fields, validation,
 * per-section save state and translations exist once.
 */
export async function generateMetadata() {
  const { t } = await getTranslator();

  return {
    title: t("account.settingsMetaTitle"),
    description: t("account.settingsMetaDescription"),
  };
}

export default async function SettingsPage() {
  await connection();
  const { t } = await getTranslator();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("account.settingsTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("account.settingsSubtitle")}</p>
      </header>

      <ProfileForm variant="settings" />
    </div>
  );
}
