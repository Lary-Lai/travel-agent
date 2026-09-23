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
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";

import { AgentPromo } from "@/components/agent-promo";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListingCard } from "@/components/listing-card";
import { SearchBar } from "@/components/search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { getCityStats, getRecommendedListings, type CityStat } from "@/server/listing.service";
import type { ListingSummary, PropertyTypeValue } from "@/types";
import { PROPERTY_TYPE_LABELS } from "@/types";

/** Category chips double as a fast filter entry point into /search. */
const CATEGORIES: Array<{ type: PropertyTypeValue; icon: typeof Building2 }> = [
  { type: "APARTMENT", icon: Building2 },
  { type: "HOUSE", icon: HomeIcon },
  { type: "HOTEL", icon: Hotel },
  { type: "VILLA", icon: Palmtree },
  { type: "LOFT", icon: Warehouse },
  { type: "GUESTHOUSE", icon: Tent },
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
      <section className="from-primary/10 via-background to-background relative overflow-hidden rounded-3xl border bg-gradient-to-br px-6 py-12 sm:px-10 sm:py-16">
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="bg-background/80 mb-4 backdrop-blur">
            <Sparkles className="size-3.5" />
            AI Travel Agent 已上线
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            让 AI 帮你找到
            <span className="text-primary"> 旅途中的家</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-sm leading-relaxed sm:text-base">
            {cities.length > 0 ? `${cities.length} 座城市 · ${totalListings} 套真实房源。` : ""}
            搜索、收藏、预订，或者直接用一句话描述需求，让 Agent 帮你搞定。
          </p>

          <div className="mt-8">
            <SearchBar
              variant="hero"
              destinations={cities.map((city) => ({ city: city.city, cityLabel: city.cityLabel }))}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {CATEGORIES.slice(0, 4).map((category) => (
              <Link
                key={category.type}
                href={`/search?propertyType=${category.type}`}
                className="bg-background/70 hover:border-primary/40 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors"
              >
                <category.icon className="size-3.5" />
                {PROPERTY_TYPE_LABELS[category.type]}
              </Link>
            ))}
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
                  className="hover:border-primary/40 group flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors"
                >
                  <span className="bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary flex size-10 items-center justify-center rounded-xl transition-colors">
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
          <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                  <TrendingUp className="size-5" />
                  热门目的地
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">点击城市，直接查看当地全部房源</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/search">查看全部</Link>
              </Button>
            </div>

            {cities.length === 0 ? (
              <EmptyState
                title="还没有房源数据"
                description="运行 npm run db:seed 生成演示房源后刷新本页。"
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                {cities.map((city) => (
                  <Link
                    key={city.city}
                    href={`/search?location=${encodeURIComponent(city.city)}`}
                    className="group relative overflow-hidden rounded-2xl border"
                  >
                    <div className="relative aspect-4/5">
                      <Image
                        src={city.image}
                        alt={city.cityLabel}
                        fill
                        sizes="(max-width: 768px) 50vw, 16vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
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
          <section className="space-y-5">
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
