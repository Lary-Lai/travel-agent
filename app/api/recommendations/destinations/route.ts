import { getCurrentUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { getSearchInsights } from "@/server/personalization.service";
import { getCityStats } from "@/server/listing.service";
import type { PersonalizedDestination } from "@/types";

/**
 * GET /api/recommendations/destinations
 *
 * Cities to suggest, driven by the caller's own search history.
 *
 * Signed-out visitors get an empty `personalised` list and a `popular` fallback,
 * so the home page can render one section either way instead of branching.
 */
export const GET = handler(async () => {
  const [user, cities] = await Promise.all([getCurrentUser(), getCityStats()]);

  const popular: PersonalizedDestination[] = cities.slice(0, 6).map((city) => ({
    city: city.city,
    cityLabel: city.cityLabel,
    hits: 0,
    reasonKey: "home.reasonPopular",
    reasonVars: { count: city.count },
    reason: `${city.count} 套房源`,
  }));

  if (!user) {
    return ok({
      personalised: false,
      totalSearches: 0,
      summary: "",
      destinations: popular,
      source: "popular" as const,
    });
  }

  const insights = await getSearchInsights(user.id);

  // Only suggest cities that actually have inventory behind them.
  const known = new Map(cities.map((city) => [city.city, city]));
  const fromHistory = insights.topCities.filter((entry) => known.has(entry.city));

  if (fromHistory.length === 0) {
    return ok({
      personalised: true,
      totalSearches: insights.totalSearches,
      summary: insights.summary,
      destinations: popular,
      source: "popular" as const,
    });
  }

  // Top up with popular cities the user has not searched, so the row is never
  // thinner than the layout expects.
  const seen = new Set(fromHistory.map((entry) => entry.city));
  const fill = popular.filter((entry) => !seen.has(entry.city));
  const merged = [...fromHistory, ...fill].slice(0, 6);

  return ok({
    personalised: true,
    totalSearches: insights.totalSearches,
    summary: insights.summary,
    destinations: merged,
    source: "history" as const,
  });
});
