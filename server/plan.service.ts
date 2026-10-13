import { prisma } from "../lib/db";
import { badRequest, notFound } from "../lib/http";
import { MAX_PLAN_DAY } from "../lib/plan-limits";
import type { MapOverviewDto, PlanItemDto } from "../types";

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
      location: true,
      latitude: true,
      longitude: true,
      pricePerNight: true,
      rating: true,
      // One photo per listing, for the hover card on the map pins. `take: 1` keeps the
      // payload at one URL per listing instead of every image in the catalogue.
      images: { select: { url: true }, take: 1, orderBy: { position: "asc" } },
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
      location: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
      pricePerNight: row.pricePerNight,
      rating: row.rating,
      image: row.images[0]?.url ?? null,
    })),
  };
}

// ------------------------------------------------------------------ itinerary

const planItemSelect = {
  id: true,
  day: true,
  note: true,
  createdAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      city: true,
      location: true,
      pricePerNight: true,
      rating: true,
      latitude: true,
      longitude: true,
      images: { select: { url: true }, take: 1 },
    },
  },
} as const;

type PlanRow = {
  id: string;
  day: number;
  note: string | null;
  createdAt: Date;
  listing: {
    id: string;
    title: string;
    city: string;
    location: string;
    pricePerNight: number;
    rating: number;
    latitude: number;
    longitude: number;
    images: { url: string }[];
  };
};

const toPlanDto = (row: PlanRow): PlanItemDto => ({
  id: row.id,
  day: row.day,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
  listing: {
    id: row.listing.id,
    title: row.listing.title,
    city: row.listing.city,
    location: row.listing.location,
    pricePerNight: row.listing.pricePerNight,
    rating: row.listing.rating,
    latitude: row.listing.latitude,
    longitude: row.listing.longitude,
    image: row.listing.images[0]?.url ?? null,
  },
});

/** The plan, ordered the way it is read: by day, then by when it was added. */
export async function getPlan(userId: string): Promise<PlanItemDto[]> {
  const rows = await prisma.planItem.findMany({
    where: { userId },
    orderBy: [{ day: "asc" }, { createdAt: "asc" }],
    select: planItemSelect,
  });
  return rows.map(toPlanDto);
}

/**
 * Put a listing on a day, or move it to another day.
 *
 * `upsert` on `(userId, listingId)`: the intent behind "add this to day 3" is *which day
 * this belongs to*, so re-adding relocates rather than creating a second copy. The
 * ownership of both the listing and the plan follows from the compound key — a listing
 * id from somebody else's plan cannot be moved into this one, because there is no row
 * with this `userId` to update.
 */
export async function putPlanItem(
  userId: string,
  listingId: string,
  day: number,
  note?: string | null,
): Promise<PlanItemDto> {
  if (!Number.isInteger(day) || day < 1 || day > MAX_PLAN_DAY) {
    throw badRequest(`行程天数需要在 1 到 ${MAX_PLAN_DAY} 之间`);
  }

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true },
  });
  if (!listing) throw notFound("房源不存在或已被下架");

  const row = await prisma.planItem.upsert({
    where: { userId_listingId: { userId, listingId } },
    create: { userId, listingId, day, note: note ?? null },
    update: { day, note: note ?? null },
    select: planItemSelect,
  });

  return toPlanDto(row);
}

/**
 * Remove an item from the plan.
 *
 * Two ways to name it, because both are natural: the plan row's own id (from the UI) or
 * the listing id (from the assistant, which thinks in listings). `deleteMany` with the
 * `userId` in the filter means neither can touch another account's plan, and a second
 * delete is a no-op rather than an error.
 */
export async function removePlanItem(
  userId: string,
  { itemId, listingId }: { itemId?: string; listingId?: string },
): Promise<number> {
  if (!itemId && !listingId) throw badRequest("需要提供行程条目 id 或房源 id");

  const removed = await prisma.planItem.deleteMany({
    where: { userId, ...(itemId ? { id: itemId } : { listingId }) },
  });
  return removed.count;
}
