import {
  Building2,
  Home as HomeIcon,
  Hotel,
  Palmtree,
  Sparkles,
  Tent,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { AgentPromo } from "@/components/agent-promo";
import { SafeImage } from "@/components/safe-image";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListingCard } from "@/components/listing-card";
import { PersonalizedDestinations } from "@/components/personalized-destinations";
import { StickySearchBar } from "@/components/sticky-search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { cityName } from "@/lib/i18n/cities";
import { propertyTypeLabel } from "@/lib/i18n/labels";
import { getTranslator } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { getCityStats, getRecommendedListings, type CityStat } from "@/server/listing.service";
import type { ListingSummary, PropertyTypeValue } from "@/types";

/** Category chips double as a fast filter entry point into /search. */
const CATEGORIES: Array<{
  type: PropertyTypeValue;
  icon: typeof Building2;
  /** Soft gradient behind the icon, one hue per category. */
  tint: string;
}> = [
  { type: "APARTMENT", icon: Building2, tint: "from-sky-500/20 to-blue-500/5 text-sky-600 dark:text-sky-400" },
  { type: "HOUSE", icon: HomeIcon, tint: "from-emerald-500/20 to-teal-500/5 text-emerald-600 dark:text-emerald-400" },
  { type: "HOTEL", icon: Hotel, tint: "from-amber-500/20 to-orange-500/5 text-amber-600 dark:text-amber-400" },
  { type: "VILLA", icon: Palmtree, tint: "from-rose-500/20 to-pink-500/5 text-rose-600 dark:text-rose-400" },
  { type: "LOFT", icon: Warehouse, tint: "from-violet-500/20 to-purple-500/5 text-violet-600 dark:text-violet-400" },
  { type: "GUESTHOUSE", icon: Tent, tint: "from-lime-500/20 to-green-500/5 text-lime-600 dark:text-lime-400" },
];

export default async function HomePage() {
  // Data comes from PostgreSQL, so render per request instead of at build time.
  await connection();

  let cities: CityStat[] = [];
  let listings: ListingSummary[] = [];
  let loadFailed = false;

  try {
    [cities, listings] = await Promise.all([getCityStats(), getRecommendedListings(8)]);
  } catch (error) {
    console.error("[home] failed to load data:", error);
    loadFailed = true;
  }

  const { locale, t } = await getTranslator();
  const totalListings = cities.reduce((sum, city) => sum + city.count, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-16 px-4 py-8 sm:px-6 lg:px-8">
      {/* ---------------------------------------------------------------- hero */}
      {/* Depth is four stacked layers: a masked grid, soft brand washes, a white
          grain film that also dithers the gradient's banding away, and a glow
          bleeding up from behind the search bar. */}
      <section className="surface-hero edge-light shadow-float-lg relative overflow-hidden rounded-3xl border">
        <div className="grid-fade pointer-events-none absolute inset-0" aria-hidden />
        <div
          className="from-primary/12 pointer-events-none absolute inset-x-0 -bottom-24 h-56 bg-gradient-to-t to-transparent"
          aria-hidden
        />
        <div className="noise-veil pointer-events-none absolute inset-0 opacity-[0.14]" aria-hidden />

        <div className="relative z-10 px-6 py-12 sm:px-10 sm:py-16">
          {/* Wider than the title on purpose: the supporting line has to hold a
              single row, while the title breaks where it reads best. */}
          <div className="mx-auto max-w-4xl text-center">
            <Badge
              variant="secondary"
              className="edge-light bg-background/70 mb-4 border-transparent backdrop-blur"
            >
              <Sparkles className="size-3.5" />
              {t("home.badge")}
            </Badge>
            <h1 className="mx-auto max-w-3xl text-3xl leading-[1.2] font-semibold tracking-[0.06em] sm:text-4xl md:text-5xl">
              {t("home.heroLine1")}
              <span className="from-primary bg-gradient-to-r to-rose-500 bg-clip-text text-transparent">
                {" "}
                {t("home.heroLine2")}
              </span>
            </h1>
            {/* One row from `lg` up (a wider measure plus `nowrap`), a roomier
                line-height, and the light grey token so it stays three steps
                below the title in weight and value. */}
            <p className="text-hero-subtitle mx-auto mt-4 text-sm leading-7 sm:text-base lg:whitespace-nowrap">
              {cities.length > 0
                ? t("home.heroSubtitle", { cities: cities.length, listings: totalListings })
                : ""}
            </p>

            <div className="relative mt-8">
              <div className="glow-primary pointer-events-none absolute inset-x-8 -inset-y-4 -z-10" aria-hidden />
              <StickySearchBar
                destinations={cities.map((city) => ({
                  city: city.city,
                  cityLabel: cityName(locale, city.city),
                }))}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {CATEGORIES.slice(0, 4).map((category) => (
                <Link
                  key={category.type}
                  href={`/search?propertyType=${category.type}`}
                  className="edge-light bg-background/70 hover:border-primary/40 hover:bg-background flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition-all hover:-translate-y-px"
                >
                  <category.icon className="size-3.5" />
                  {propertyTypeLabel(t, category.type)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {loadFailed ? (
        <ErrorState
          title={t("home.loadFailedTitle")}
          description={t("home.loadFailedBody")}
        />
      ) : (
        <>
          {/* ------------------------------------------------------ categories */}
          <section id="browse" className="scroll-mt-32 space-y-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{t("home.browseByType")}</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("home.browseByTypeHint")}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {CATEGORIES.map((category) => (
                <Link
                  key={category.type}
                  href={`/search?propertyType=${category.type}`}
                  className="surface-sheen edge-light shadow-float hover:border-primary/40 group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-float-lg"
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl bg-gradient-to-br transition-transform group-hover:scale-105",
                      category.tint,
                    )}
                  >
                    <category.icon className="size-5" />
                  </span>
                  <span className="text-xs font-medium">
                    {propertyTypeLabel(t, category.type)}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* ---------------------------------------------------- destinations */}
          <section id="destinations" className="scroll-mt-32 space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                  <TrendingUp className="size-5" />
                  {t("home.destinations")}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t("home.destinationsHint", { cities: cities.length })}
                </p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/search">{t("common.viewAll")}</Link>
              </Button>
            </div>

            {/* Quick city selector — one click, no need to open the search form. */}
            {cities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {cities.map((city) => (
                  <Link
                    key={city.city}
                    href={`/search?location=${encodeURIComponent(city.city)}`}
                    className="edge-light bg-secondary/60 hover:border-primary/40 hover:bg-secondary rounded-full border border-transparent px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-px"
                  >
                    {cityName(locale, city.city)}
                  </Link>
                ))}
              </div>
            ) : null}

            {cities.length === 0 ? (
              <EmptyState title={t("home.emptyTitle")} description={t("home.emptyBody")} />
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                {cities.map((city) => (
                  <Link
                    key={city.city}
                    href={`/search?location=${encodeURIComponent(city.city)}`}
                    className="group edge-light shadow-float hover:shadow-float-lg relative overflow-hidden rounded-2xl border transition-all hover:-translate-y-0.5"
                  >
                    <div className="relative aspect-4/5">
                      <SafeImage
                        src={city.image}
                        alt={city.cityLabel}
                        sizes="(max-width: 768px) 50vw, 20vw"
                        className="transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                      <p className="text-sm font-semibold">{cityName(locale, city.city)}</p>
                      <p className="text-[11px] text-white/80">
                        {t("home.destinationCard", {
                          count: city.count,
                          price: formatPrice(city.minPrice),
                        })}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* ----------------------------------------------------- recommended */}
          <PersonalizedDestinations />

          <section id="recommended" className="scroll-mt-32 space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{t("home.recommended")}</h2>
                <p className="text-muted-foreground mt-1 text-sm">{t("home.recommendedHint")}</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/search">{t("home.browseAll")}</Link>
              </Button>
            </div>

            {listings.length === 0 ? (
              <EmptyState
                title={t("auth.homeNoListings")}
                description={t("auth.homeNoListingsBody")}
              />
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {listings.map((listing, index) => (
                  <ListingCard key={listing.id} listing={listing} priority={index < 4} />
                ))}
              </div>
            )}
          </section>

          {/* ----------------------------------------------------------- agent */}
          <AgentPromo />
        </>
      )}
    </div>
  );
}
