import { connection } from "next/server";

import { PlanView } from "@/components/plan-view";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Trip planning.
 *
 * A page rather than a card in the settings drawer: a map needs the width, and
 * planning is a task you sit in rather than a field you set. It is reached from the
 * settings drawer, which is where the request for it came from.
 */
export async function generateMetadata() {
  const { t } = await getTranslator();

  return {
    title: t("plan.metaTitle"),
    description: t("plan.metaDescription"),
  };
}

export default async function PlanPage() {
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PlanView />
    </div>
  );
}
