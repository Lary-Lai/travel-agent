import { connection } from "next/server";
import { Suspense } from "react";

import { ListingGridSkeleton } from "@/components/listing-card";
import { getTranslator } from "@/lib/i18n/server";
import { SearchResults } from "@/components/search-results";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata() {
  const { t } = await getTranslator();
  return {
    title: t("searchResults.metaTitle"),
    description: t("searchResults.metaDescription"),
  };
}

function SearchFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-2xl" />
      <div className="flex gap-8">
        <Skeleton className="hidden h-96 w-64 shrink-0 rounded-2xl lg:block" />
        <div className="min-w-0 flex-1 space-y-4">
          <Skeleton className="h-8 w-52" />
          <ListingGridSkeleton count={6} />
        </div>
      </div>
    </div>
  );
}

export default async function SearchPage() {
  // Results depend on the request's query string.
  await connection();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Suspense fallback={<SearchFallback />}>
        <SearchResults />
      </Suspense>
    </div>
  );
}
