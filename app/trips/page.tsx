import { connection } from "next/server";

import { TripsView } from "@/components/trips-view";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getTranslator();
  return {
    title: t("trips.metaTitle"),
    description: t("trips.metaDescription"),
  };
}

export default async function TripsPage() {
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <TripsView />
    </div>
  );
}
