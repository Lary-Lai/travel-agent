import { connection } from "next/server";

import { FriendsView } from "@/components/friends-view";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getTranslator();

  return {
    title: t("social.friendsTitle"),
    description: t("social.friendsSubtitle"),
  };
}

export default async function FriendsPage() {
  await connection();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <FriendsView />
    </div>
  );
}
