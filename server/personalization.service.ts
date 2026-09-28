/**
 * Search-history personalisation.
 *
 * Records what signed-in users actually searched for, then turns that into
 * destination suggestions. Two deliberate choices:
 *
 *  - **Only signed-in searches are recorded.** An anonymous session has no stable
 *    identity to personalise, and keeping strangers' queries would be collecting
 *    data with no purpose to serve.
 *  - **The canonical city name is stored alongside the raw query.** "东京",
 *    "Tokyo" and "tokyo" are three strings but one intent; storing the resolved
 *    city is what makes the counts mean anything.
 *
 * Recency is weighted rather than just counted: someone who searched Tokyo five
 * times last month and Reykjavík twice this week is more likely planning the
 * latter.
 */
import { findCity } from "../lib/cities";
import { prisma } from "../lib/db";
import type { PersonalizedDestination, SearchInsights } from "../types";

/** How many recent searches feed the analysis. */
const WINDOW = 60;

/** Half-life for the recency weighting, in days. */
const HALF_LIFE_DAYS = 14;

export async function recordSearch(
  userId: string,
  input: {
    location?: string | null;
    guests?: number | null;
    priceMin?: number | null;
    priceMax?: number | null;
    propertyType?: string | null;
  },
): Promise<void> {
  const query = (input.location ?? "").trim();
  if (!query) return;

  // Resolve to a canonical city so "东京"/"Tokyo" aggregate together.
  const city = findCity(query)?.name ?? null;

  // Collapse repeats: re-running the same search (a refresh, or nudging the
  // price slider) should not inflate the signal.
  const recent = await prisma.searchEvent.findFirst({
    where: { userId, query, city },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < 60 * 60 * 1000) {
    return;
  }

  await prisma.searchEvent.create({
    data: {
      userId,
      query,
      city,
      guests: input.guests ?? null,
      priceMin: input.priceMin ?? null,
      priceMax: input.priceMax ?? null,
      propertyType: (input.propertyType as never) ?? null,
    },
  });
}

/** Recency-weighted count per city. */
function weigh(
  events: Array<{ city: string | null; createdAt: Date }>,
): Map<string, number> {
  const scores = new Map<string, number>();
  const now = Date.now();

  for (const event of events) {
    if (!event.city) continue;
    const ageDays = (now - event.createdAt.getTime()) / 86_400_000;
    const weight = 0.5 ** (ageDays / HALF_LIFE_DAYS);
    scores.set(event.city, (scores.get(event.city) ?? 0) + weight);
  }

  return scores;
}

/**
 * What the user's history says about them.
 * Returns an empty-but-valid payload for a new account rather than throwing, so
 * callers never have to special-case "no history yet".
 */
export async function getSearchInsights(userId: string): Promise<SearchInsights> {
  const events = await prisma.searchEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: WINDOW,
    select: { city: true, createdAt: true },
  });

  const totalSearches = await prisma.searchEvent.count({ where: { userId } });
  const lastSearchAt = events[0]?.createdAt.toISOString() ?? null;
  const scores = weigh(events);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const topCities: PersonalizedDestination[] = ranked.map(([city], index) => {
    const hits = events.filter((event) => event.city === city).length;
    return {
      city,
      // The label is looked up by callers that need it; findCity gives Chinese.
      cityLabel: findCity(city)?.nameZh ?? city,
      hits,
      reason:
        index === 0
          ? `你最近搜索「${findCity(city)?.nameZh ?? city}」${hits} 次`
          : `搜索过 ${hits} 次`,
    };
  });

  const summary =
    topCities.length === 0
      ? "该用户还没有搜索记录。"
      : `该用户共搜索 ${totalSearches} 次，最常关注的目的地依次是：` +
        topCities.map((c) => `${c.cityLabel}（${c.hits} 次）`).join("、") +
        "。推荐时可以优先考虑这些城市。";

  return { topCities, totalSearches, lastSearchAt, summary };
}
