import { connection } from "next/server";

import { WishlistView } from "@/components/wishlist-view";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getTranslator();
  return {
    title: t("wishlist.pageTitle"),
    description: t("wishlist.pageDescription"),
  };
}

export default async function WishlistPage() {
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <WishlistView />
    </div>
  );
}
