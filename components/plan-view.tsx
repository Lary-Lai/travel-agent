"use client";

import { useQuery } from "@tanstack/react-query";
import { Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useT } from "@/components/locale-provider";
import { PlanningMap } from "@/components/planning-map";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { useAgentStore } from "@/lib/store";
import type { MapOverviewDto } from "@/types";

/**
 * Trip planner: a map of the catalogue, and the assistant to plan against it.
 *
 * The AI entry point is the point of this page. Asking the assistant to "plan three
 * days" is only useful if it knows *what* you are looking at, so the button seeds a
 * prompt from the current selection (the city, and how many listings are in view)
 * through `openWithPrompt`, which the agent provider auto-sends. A bare "ask AI"
 * button that opens an empty drawer is the version of this feature that looks
 * finished and is useless.
 */
export function PlanView() {
  const t = useT();
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const openWithPrompt = useAgentStore((state) => state.openWithPrompt);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["map-overview"],
    queryFn: () => api.getMapOverview(),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[768px] w-full max-w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-muted-foreground text-sm">{t("plan.loadFailed")}</p>;
  }

  const overview: MapOverviewDto = data;
  const selected = overview.cities.find((city) => city.city === selectedCity) ?? null;
  const cityListings = selected
    ? overview.listings.filter((listing) => listing.city === selected.city)
    : [];

  /** A prompt that carries the current view, so the assistant starts informed. */
  const askPrompt = selected
    ? t("plan.askAboutCity", { city: selected.city, count: cityListings.length })
    : t("plan.askGeneral", { count: overview.cities.length });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("plan.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("plan.subtitle", {
              cities: overview.cities.length,
              listings: overview.listings.length,
            })}
          </p>
        </div>

        <Button className="gap-2" onClick={() => openWithPrompt(askPrompt)}>
          <Sparkles className="size-4" />
          {selected ? t("plan.askAboutSelected") : t("plan.askGeneralAction")}
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PlanningMap
          cities={overview.cities}
          listings={overview.listings}
          selectedCity={selectedCity}
          onSelectCity={setSelectedCity}
        />

        {/* The city's listings, so the map has a readable companion: pins alone
            cannot say what a place costs or whether it is free on your dates. */}
        <aside className="space-y-3 rounded-2xl border p-5">
          <h2 className="text-sm font-semibold">
            {selected ? selected.city : t("plan.allCities")}
          </h2>

          {!selected ? (
            <ul className="space-y-2">
              {overview.cities.map((city) => (
                <li key={city.city}>
                  <button
                    type="button"
                    onClick={() => setSelectedCity(city.city)}
                    className="hover:bg-accent flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
                  >
                    <span>{city.city}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {t("plan.cityRow", {
                        count: city.listingCount,
                        price: formatPrice(city.minPricePerNight),
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2">
              {cityListings.map((listing) => (
                <li key={listing.id}>
                  <Link
                    href={`/listings/${listing.id}`}
                    className="hover:bg-accent block rounded-lg px-2 py-1.5 transition-colors"
                  >
                    <span className="line-clamp-1 text-sm">{listing.title}</span>
                    <span className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1">
                        <Star className="size-3 fill-current" />
                        {listing.rating.toFixed(1)}
                      </span>
                      <span className="tabular-nums">
                        {formatPrice(listing.pricePerNight)}
                        {t("plan.perNight")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
