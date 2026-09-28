"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FilterPanel } from "@/components/filter-panel";
import { ListingCard, ListingGridSkeleton } from "@/components/listing-card";
import { CityWeatherStrip } from "@/components/city-weather-strip";
import { SearchBar } from "@/components/search-bar";
import { SearchRecorder } from "@/components/search-recorder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatDateShort } from "@/lib/format";
import { buildSearchQuery, countActiveFilters, parseSearchParams } from "@/lib/search-params";
import { useSearchDraftStore } from "@/lib/store";
import type { ListingSearchInput, SortOption } from "@/types";
import { useT } from "@/components/locale-provider";
import { propertyTypeLabel, sortLabel } from "@/lib/i18n/labels";
import { SORT_OPTIONS } from "@/types";

export function SearchResults() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const urlParams = useSearchParams();
  const setDraft = useSearchDraftStore((state) => state.setDraft);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // The URL is the single source of truth, so a refresh restores the search.
  const criteria = useMemo<ListingSearchInput>(() => {
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(urlParams.keys())) {
      const values = urlParams.getAll(key);
      raw[key] = values.length === 1 ? values[0] : values;
    }
    return parseSearchParams(raw);
  }, [urlParams]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["listings", criteria],
    queryFn: () => api.searchListings(criteria),
    // Keep the previous page visible while the next one loads.
    placeholderData: keepPreviousData,
  });

  /** Write criteria back to the URL (and the shared draft) without a reload. */
  const updateCriteria = (patch: Partial<ListingSearchInput>, resetPage = true) => {
    const next: ListingSearchInput = { ...criteria, ...patch };
    if (resetPage) delete next.page;
    router.replace(`${pathname}${buildSearchQuery(next)}`, { scroll: false });
    if (patch.location !== undefined || patch.checkIn !== undefined || patch.guests !== undefined) {
      setDraft({
        destination: next.location ?? "",
        checkIn: next.checkIn ?? "",
        checkOut: next.checkOut ?? "",
        guests: next.guests ?? 2,
      });
    }
  };

  const resetFilters = () => router.replace(pathname, { scroll: false });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;
  const activeCount = countActiveFilters(criteria);

  const chips: Array<{ label: string; onRemove: () => void }> = [];
  if (criteria.location) {
    chips.push({ label: criteria.location, onRemove: () => updateCriteria({ location: undefined }) });
  }
  if (criteria.checkIn && criteria.checkOut) {
    chips.push({
      label: `${formatDateShort(criteria.checkIn)} – ${formatDateShort(criteria.checkOut)}`,
      onRemove: () => updateCriteria({ checkIn: undefined, checkOut: undefined }),
    });
  }
  if (criteria.guests) {
    chips.push({ label: t("searchResults.guestsChip", { count: criteria.guests }), onRemove: () => updateCriteria({ guests: undefined }) });
  }
  if (criteria.priceMin !== undefined || criteria.priceMax !== undefined) {
    chips.push({
      label: criteria.priceMax
        ? t("searchResults.priceChip", { min: criteria.priceMin ?? 0, max: criteria.priceMax })
        : t("searchResults.priceChipAny", { min: criteria.priceMin ?? 0 }),
      onRemove: () => updateCriteria({ priceMin: undefined, priceMax: undefined }),
    });
  }
  if (criteria.propertyType) {
    chips.push({
      label: propertyTypeLabel(t, criteria.propertyType),
      onRemove: () => updateCriteria({ propertyType: undefined }),
    });
  }
  for (const amenity of criteria.amenities ?? []) {
    chips.push({
      label: amenity,
      onRemove: () =>
        updateCriteria({
          amenities: (criteria.amenities ?? []).filter((item) => item !== amenity),
        }),
    });
  }

  return (
    <div className="space-y-6">
      {/* Feed what the user is searching into personalisation (no-op when out). */}
      <SearchRecorder
        location={criteria.location}
        guests={criteria.guests}
        priceMin={criteria.priceMin}
        priceMax={criteria.priceMax}
        propertyType={criteria.propertyType}
      />

      {/* Search bar keeps the current criteria so it never looks reset. */}
      <SearchBar
        variant="compact"
        initial={{
          destination: criteria.location ?? "",
          checkIn: criteria.checkIn,
          checkOut: criteria.checkOut,
          guests: criteria.guests ?? 2,
        }}
        onSearch={(draft) =>
          updateCriteria({
            location: draft.destination || undefined,
            checkIn: draft.checkIn || undefined,
            checkOut: draft.checkOut || undefined,
            guests: draft.guests,
          })
        }
      />

      {/* Weather for the city currently being searched. */}
      {criteria.location ? <CityWeatherStrip city={criteria.location} /> : null}

      <div className="flex gap-8">
        {/* -------------------------------------------------- desktop filters */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24">
            <FilterPanel value={criteria} onChange={updateCriteria} onReset={resetFilters} />
          </div>
        </aside>

        {/* ---------------------------------------------------------- results */}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {criteria.location ? t("searchResults.titleIn", { city: criteria.location }) : t("searchResults.titleAll")}
              </h1>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {isLoading ? t("searchResults.searching") : t("searchResults.found", { count: total })}
                {criteria.checkIn && criteria.checkOut ? t("searchResults.dateFiltered") : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Mobile filters */}
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 lg:hidden">
                    <SlidersHorizontal className="size-4" />
                    {t("searchResults.filterTrigger")}
                    {activeCount > 0 ? (
                      <Badge className="ml-0.5 size-5 justify-center rounded-full p-0 text-[10px]">
                        {activeCount}
                      </Badge>
                    ) : null}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 overflow-y-auto p-6">
                  <SheetTitle className="sr-only">{t("filters.title")}</SheetTitle>
                  <FilterPanel value={criteria} onChange={updateCriteria} onReset={resetFilters} />
                </SheetContent>
              </Sheet>

              <Select
                value={criteria.sort ?? "recommended"}
                onValueChange={(value) => updateCriteria({ sort: value as SortOption }, false)}
              >
                <SelectTrigger className="w-40" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {sortLabel(t, option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active filter chips */}
          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={chip.onRemove}
                  className="bg-accent hover:bg-accent/70 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                >
                  {chip.label}
                  <X className="size-3" />
                </button>
              ))}
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetFilters}>
                {t("searchResults.clearAll")}
              </Button>
            </div>
          ) : null}

          {isError ? (
            <ErrorState
              title={t("searchResults.loadFailedTitle")}
              description={t("searchResults.loadFailedBody")}
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <ListingGridSkeleton count={8} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t("searchResults.noResults")}
              description={t("searchResults.noResultsHint")}
              action={
                <Button variant="outline" onClick={resetFilters}>
                  {t("searchResults.clearAllFilters")}
                </Button>
              }
            />
          ) : (
            <>
              <div
                className={`grid grid-cols-1 gap-x-6 gap-y-8 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${
                  isFetching ? "opacity-60" : "opacity-100"
                }`}
              >
                {items.map((listing, index) => (
                  <ListingCard key={listing.id} listing={listing} priority={index < 3} />
                ))}
              </div>

              {totalPages > 1 ? (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => updateCriteria({ page: page - 1 }, false)}
                    className="gap-1"
                  >
                    <ChevronLeft className="size-4" />
                    {t("searchResults.prev")}
                  </Button>
                  <span className="text-muted-foreground px-2 text-sm tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => updateCriteria({ page: page + 1 }, false)}
                    className="gap-1"
                  >
                    {t("searchResults.next")}
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              ) : null}
            </>
          )}

          {criteria.location ? (
            <p className="text-muted-foreground flex items-center gap-1.5 pt-2 text-xs">
              <MapPin className="size-3.5" />
              {t("searchResults.aiHint")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
