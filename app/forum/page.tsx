import { connection } from "next/server";
import { Suspense } from "react";

import { ForumView } from "@/components/forum-view";
import { getTranslator } from "@/lib/i18n/server";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata() {
  const { t } = await getTranslator();
  return {
    title: t("forum.metaTitle"),
    description: t("forum.metaDescription"),
  };
}

/** Shaped like the real view, so the page does not jump when it arrives. */
function ForumFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full max-w-2xl rounded-2xl" />
      <div className="flex gap-8">
        <Skeleton className="hidden h-80 w-60 shrink-0 rounded-2xl lg:block" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export default async function ForumPage() {
  // The board / sort / search live in the query string, so this page is
  // request-scoped rather than a static shell.
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Suspense fallback={<ForumFallback />}>
        <ForumView />
      </Suspense>
    </div>
  );
}
