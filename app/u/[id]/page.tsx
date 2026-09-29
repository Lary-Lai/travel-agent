import { connection } from "next/server";

import { PublicProfileView } from "@/components/public-profile-view";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getTranslator();

  return {
    title: t("social.metaTitle"),
    description: t("social.metaDescription"),
  };
}

/**
 * `/u/[id]` — someone else's profile.
 *
 * The id is resolved on the server (Next 16 hands `params` over as a promise) and
 * the work is left to a client component, which reads `/api/users/[id]`. That is
 * deliberate: the endpoint decides what this viewer may see, and the page must
 * render the *reason* when it refuses, so the visibility rule lives in exactly
 * one place rather than being re-implemented against the database here.
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PublicProfileView id={id} />
    </div>
  );
}
