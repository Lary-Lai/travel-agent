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
import { cn } from "@/lib/utils";
import { getCityStats, getRecommendedListings, type CityStat } from "@/server/listing.service";
import type { ListingSummary, PropertyTypeValue } from "@/types";
import { PROPERTY_TYPE_LABELS } from "@/types";

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

  const totalListings = cities.reduce((sum, city) => sum + city.count, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-16 px-4 py-8 sm:px-6 lg:px-8">
      {/* ---------------------------------------------------------------- hero */}
      {/* Depth is three stacked layers: a masked grid, soft brand washes, and a
          glow bleeding up from behind the search bar. */}
      <section className="surface-hero edge-light relative overflow-hidden rounded-3xl border shadow-sm">
        <div className="grid-fade pointer-events-none absolute inset-0" aria-hidden />
        <div
          className="from-primary/12 pointer-events-none absolute inset-x-0 -bottom-24 h-56 bg-gradient-to-t to-transparent"
          aria-hidden
        />

        <div className="relative z-10 px-6 py-12 sm:px-10 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="secondary"
              className="edge-light bg-background/70 mb-4 border-transparent backdrop-blur"
            >
              <Sparkles className="size-3.5" />
              AI Travel Agent 已上线
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              让 AI 帮你找到
              <span className="from-primary bg-gradient-to-r to-rose-500 bg-clip-text text-transparent">
                {" "}
                旅途中的家
              </span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-sm leading-relaxed sm:text-base">
              {cities.length > 0 ? `${cities.length} 座城市 · ${totalListings} 套真实房源。` : ""}
              搜索、收藏、预订，或者直接用一句话描述需求，让 Agent 帮你搞定。
            </p>

            <div className="relative mt-8">
              <div className="glow-primary pointer-events-none absolute inset-x-8 -inset-y-4 -z-10" aria-hidden />
              <StickySearchBar
                destinations={cities.map((city) => ({ city: city.city, cityLabel: city.cityLabel }))}
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
                  {PROPERTY_TYPE_LABELS[category.type]}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {loadFailed ? (
        <ErrorState
          title="房源数据加载失败"
          description="无法连接数据库。请确认 PostgreSQL 已启动（npm run db:start）并已执行 npm run db:seed。"
        />
      ) : (
        <>
          {/* ------------------------------------------------------ categories */}
          <section className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">按房源类型浏览</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                公寓、独栋、酒店、别墅，总有一款适合你
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {CATEGORIES.map((category) => (
                <Link
                  key={category.type}
                  href={`/search?propertyType=${category.type}`}
                  className="surface-sheen edge-light hover:border-primary/40 group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-md"
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
                    {PROPERTY_TYPE_LABELS[category.type]}
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
                  热门目的地
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {cities.length} 座城市，点击直接查看当地全部房源
                </p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/search">查看全部</Link>
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
                    {city.cityLabel}
                  </Link>
                ))}
              </div>
            ) : null}

            {cities.length === 0 ? (
              <EmptyState
                title="还没有房源数据"
                description="运行 npm run db:seed 生成演示房源后刷新本页。"
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                {cities.map((city) => (
                  <Link
                    key={city.city}
                    href={`/search?location=${encodeURIComponent(city.city)}`}
                    className="group edge-light relative overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
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
                      <p className="text-sm font-semibold">{city.cityLabel}</p>
                      <p className="text-[11px] text-white/80">
                        {city.count} 套房源 · 起 {formatPrice(city.minPrice)}
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
                <h2 className="text-xl font-semibold tracking-tight">为你推荐的房源</h2>
                <p className="text-muted-foreground mt-1 text-sm">按评分与评价数挑选的高分房源</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/search">浏览全部房源</Link>
              </Button>
            </div>

            {listings.length === 0 ? (
              <EmptyState
                title="暂无推荐房源"
                description="运行 npm run db:seed 生成演示数据后刷新本页。"
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
