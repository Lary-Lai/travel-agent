import { prisma } from "../lib/db";
import type { MapOverviewDto } from "../types";

/**
 * The map data for trip planning.
 *
 * ## Why one request returns everything
 *
 * There are ~180 listings. One response is a few tens of kilobytes, and it means
 * zooming into a city is instant, instead of firing a request per city the user
 * clicks. When the catalogue grows past a few thousand this should become a
 * viewport query; at this size that would be complexity with no benefit.
 *
 * ## Why the city aggregate is computed here, not stored
 *
 * A city's marker is its listings' centroid, and its count and cheapest price are
 * properties of the listings — deriving them keeps the map correct when a listing
 * is added, edited or removed, with no denormalised row to keep in sync.
 */

export async function getMapOverview(): Promise<MapOverviewDto> {
  const rows = await prisma.listing.findMany({
    orderBy: { city: "asc" },
    select: {
      id: true,
      title: true,
      city: true,
      country: true,
      latitude: true,
      longitude: true,
      pricePerNight: true,
      rating: true,
    },
  });

  const byCity = new Map<string, { rows: typeof rows; country: string }>();
  for (const row of rows) {
    const entry = byCity.get(row.city);
    if (entry) {
      entry.rows.push(row);
    } else {
      byCity.set(row.city, { rows: [row], country: row.country });
    }
  }

  const cities = [...byCity.entries()]
    .map(([city, { rows: cityRows, country }]) => ({
      city,
      country,
      latitude: cityRows.reduce((sum, row) => sum + row.latitude, 0) / cityRows.length,
      longitude: cityRows.reduce((sum, row) => sum + row.longitude, 0) / cityRows.length,
      listingCount: cityRows.length,
      minPricePerNight: Math.min(...cityRows.map((row) => row.pricePerNight)),
    }))
    .sort((a, b) => b.listingCount - a.listingCount || a.city.localeCompare(b.city));

  return {
    cities,
    listings: rows.map((row) => ({
      id: row.id,
      title: row.title,
      city: row.city,
      latitude: row.latitude,
      longitude: row.longitude,
      pricePerNight: row.pricePerNight,
      rating: row.rating,
    })),
  };
}
