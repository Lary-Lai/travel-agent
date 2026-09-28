/**
 * Listing service — the ONLY place that reads listing data.
 *
 * Both the REST API and every Agent tool go through these functions, which is
 * what keeps the Agent from ever touching the database directly.
 */
import { cityLabel, countryLabel, findCity } from "../lib/cities";
import { prisma } from "../lib/db";
import { parseDateOnly } from "../lib/format";
import { badRequest, notFound } from "../lib/http";
import type {
  ListingDetail,
  ListingSearchInput,
  ListingSearchResult,
  ListingSummary,
  PropertyTypeValue,
  SortOption,
} from "../types";
import { PROPERTY_TYPE_LABELS } from "../types";
import { Prisma } from "../lib/generated/prisma/client";

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;

/** Shown when a listing unexpectedly has no gallery rows. */
export const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=75&auto=format&fit=crop";

export const LISTING_INCLUDE = {
  images: { orderBy: { position: "asc" as const } },
  amenities: { include: { amenity: true } },
  host: { select: { id: true, name: true } },
} satisfies Prisma.ListingInclude;

const DETAIL_INCLUDE = {
  images: { orderBy: { position: "asc" as const } },
  amenities: { include: { amenity: true } },
  host: { select: { id: true, name: true, avatar: true, createdAt: true } },
} satisfies Prisma.ListingInclude;

export type ListingRow = Prisma.ListingGetPayload<{ include: typeof LISTING_INCLUDE }>;
type ListingDetailRow = Prisma.ListingGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/** Map a Prisma row into the client-facing summary shape. */
export function mapListingRow(row: ListingRow): ListingSummary {
  const images = row.images.length > 0 ? row.images.map((i) => i.url) : [FALLBACK_IMAGE];
  const type = row.propertyType as PropertyTypeValue;

  return {
    id: row.id,
    title: row.title,
    location: row.location,
    city: row.city,
    cityLabel: cityLabel(row.city),
    countryLabel: countryLabel(row.country),
    pricePerNight: row.pricePerNight,
    propertyType: type,
    propertyTypeLabel: PROPERTY_TYPE_LABELS[type] ?? row.propertyType,
    rating: row.rating,
    reviewCount: row.reviewCount,
    maxGuests: row.maxGuests,
    bedrooms: row.bedrooms,
    beds: row.beds,
    bathrooms: row.bathrooms,
    image: images[0],
    images,
    amenityNames: row.amenities.map((a) => a.amenity.name),
    hostName: row.host.name,
    titleI18n: (row as { titleI18n?: Record<string, string> | null }).titleI18n ?? null,
    locationI18n: (row as { locationI18n?: Record<string, string> | null }).locationI18n ?? null,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function orderFor(sort: SortOption): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ pricePerNight: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ pricePerNight: "desc" }, { id: "asc" }];
    case "rating_desc":
    case "recommended":
    default:
      return [{ rating: "desc" }, { reviewCount: "desc" }, { id: "asc" }];
  }
}

/**
 * Build the Prisma `where` clause for a search.
 * Exported so the Agent's tools can report exactly which criteria were applied.
 */
export function buildListingWhere(input: ListingSearchInput): Prisma.ListingWhereInput {
  const filters: Prisma.ListingWhereInput[] = [];

  const raw = input.location?.trim();
  if (raw) {
    const city = findCity(raw);
    const matches: Prisma.ListingWhereInput[] = [
      { city: { contains: raw, mode: "insensitive" } },
      { location: { contains: raw, mode: "insensitive" } },
      { country: { contains: raw, mode: "insensitive" } },
    ];

    if (city) {
      // "东京" / "Tokyo" resolve to the canonical stored city name.
      matches.push({ city: { equals: city.name, mode: "insensitive" } });

      // Widen to the whole country ONLY when the query actually names the
      // country ("Japan" / "日本" / "英国"). Adding it unconditionally made a
      // city query return that city's entire country: searching "Kyoto" also
      // matched every Tokyo listing, because findCity("Kyoto") resolves to a
      // city whose country is Japan. A city name is not a country request.
      const namesCountry =
        city.country.toLowerCase() === raw.toLowerCase() ||
        city.countryZh === raw ||
        raw.toLowerCase() === city.countryZh.toLowerCase();

      if (namesCountry) {
        matches.push({ country: { equals: city.country, mode: "insensitive" } });
      }
    }

    filters.push({ OR: matches });
  }

  if (typeof input.guests === "number" && input.guests > 0) {
    filters.push({ maxGuests: { gte: Math.floor(input.guests) } });
  }

  if (input.propertyType) {
    filters.push({ propertyType: input.propertyType });
  }

  const price: Prisma.IntFilter = {};
  if (typeof input.priceMin === "number") price.gte = Math.floor(input.priceMin);
  if (typeof input.priceMax === "number") price.lte = Math.ceil(input.priceMax);
  if (Object.keys(price).length > 0) filters.push({ pricePerNight: price });

  // Every requested amenity must be present.
  for (const name of input.amenities ?? []) {
    filters.push({ amenities: { some: { amenity: { name } } } });
  }

  // Exclude stays that overlap an existing active booking.
  if (input.checkIn && input.checkOut) {
    const checkIn = parseDateOnly(input.checkIn);
    const checkOut = parseDateOnly(input.checkOut);
    if (checkOut.getTime() > checkIn.getTime()) {
      filters.push({
        bookings: {
          none: {
            status: { in: ["CONFIRMED", "PENDING"] },
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn },
          },
        },
      });
    }
  }

  return filters.length > 0 ? { AND: filters } : {};
}

export async function searchListings(
  input: ListingSearchInput = {},
): Promise<ListingSearchResult> {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize ?? DEFAULT_PAGE_SIZE)));
  const sort: SortOption = input.sort ?? "recommended";
  const where = buildListingWhere(input);

  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      include: LISTING_INCLUDE,
      orderBy: orderFor(sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: rows.map(mapListingRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    applied: { ...input, page, pageSize, sort },
  };
}

/** Full detail payload. Throws a 404 ApiError when the listing is unknown. */
export async function getListingDetail(id: string): Promise<ListingDetail> {
  if (!id?.trim()) throw badRequest("缺少房源 id");

  const row: ListingDetailRow | null = await prisma.listing.findUnique({
    where: { id },
    include: DETAIL_INCLUDE,
  });
  if (!row) throw notFound("房源不存在或已下架");

  // "How common is this amenity here?" is answered from real data, so the
  // amenity dialog can say something concrete rather than a marketing line.
  const [hostListingCount, cityListingCount, cityAmenityUsage] = await Promise.all([
    prisma.listing.count({ where: { hostId: row.host.id } }),
    prisma.listing.count({ where: { city: row.city } }),
    prisma.listingAmenity.groupBy({
      by: ["amenityId"],
      where: { listing: { city: row.city } },
      _count: { _all: true },
    }),
  ]);

  const usageByAmenityId = new Map(
    cityAmenityUsage.map((group) => [group.amenityId, group._count._all]),
  );

  return {
    ...mapListingRow(row),
    description: row.description,
    createdAt: row.createdAt.toISOString(),
    host: {
      id: row.host.id,
      name: row.host.name,
      avatar: row.host.avatar,
      joinedAt: row.host.createdAt.toISOString(),
      listingCount: hostListingCount,
    },
    gallery: row.images.map((image) => ({ url: image.url, caption: image.caption })),
    cityListingCount,
    houseRules: {
      checkInTime: row.checkInTime,
      checkOutTime: row.checkOutTime,
      rules: row.houseRules,
      notes: row.houseNotes,
    },
    amenities: row.amenities.map((a) => ({
      name: a.amenity.name,
      icon: a.amenity.icon,
      category: a.amenity.category,
      description: a.amenity.description,
      cityUsage: usageByAmenityId.get(a.amenityId) ?? 0,
    })),
  };
}

/** Fetch several listings at once, preserving the requested order (Agent compare). */
export async function getListingsByIds(ids: string[]): Promise<ListingSummary[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const rows = await prisma.listing.findMany({
    where: { id: { in: unique } },
    include: LISTING_INCLUDE,
  });

  const byId = new Map(rows.map((row) => [row.id, mapListingRow(row)]));
  return unique.map((id) => byId.get(id)).filter((l): l is ListingSummary => Boolean(l));
}

/** Homepage rail: highest rated listings across all cities. */
export async function getRecommendedListings(limit = 8): Promise<ListingSummary[]> {
  const rows = await prisma.listing.findMany({
    include: LISTING_INCLUDE,
    orderBy: [{ rating: "desc" }, { reviewCount: "desc" }, { id: "asc" }],
    take: Math.min(Math.max(1, limit), 24),
  });
  return rows.map(mapListingRow);
}

export type CityStat = {
  city: string;
  cityLabel: string;
  countryLabel: string;
  count: number;
  minPrice: number;
  image: string;
};

/** Per-city summary used by the homepage destination chips. */
export async function getCityStats(): Promise<CityStat[]> {
  const grouped = await prisma.listing.groupBy({
    by: ["city"],
    _count: { _all: true },
    _min: { pricePerNight: true },
  });

  const results = await Promise.all(
    grouped.map(async (group) => {
      const cover = await prisma.listing.findFirst({
        where: { city: group.city },
        orderBy: [{ rating: "desc" }, { id: "asc" }],
        include: { images: { orderBy: { position: "asc" }, take: 1 } },
      });

      return {
        city: group.city,
        cityLabel: cityLabel(group.city),
        countryLabel: countryLabel(cover?.country),
        count: group._count._all,
        minPrice: group._min.pricePerNight ?? 0,
        image: cover?.images[0]?.url ?? FALLBACK_IMAGE,
      };
    }),
  );

  // Stable ordering: most listings first, then alphabetical.
  return results.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/** Amenity dictionary grouped by category, for the filter panel. */
export async function getAmenityDictionary(): Promise<
  Array<{ category: string; items: Array<{ name: string; icon: string | null }> }>
> {
  const amenities = await prisma.amenity.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] });

  const byCategory = new Map<string, Array<{ name: string; icon: string | null }>>();
  for (const amenity of amenities) {
    const key = amenity.category ?? "其他";
    const list = byCategory.get(key) ?? [];
    list.push({ name: amenity.name, icon: amenity.icon });
    byCategory.set(key, list);
  }

  return [...byCategory.entries()].map(([category, items]) => ({ category, items }));
}

/** Absolute price bounds, used to seed the price filter slider. */
export async function getPriceBounds(): Promise<{ min: number; max: number }> {
  const result = await prisma.listing.aggregate({
    _min: { pricePerNight: true },
    _max: { pricePerNight: true },
  });
  return { min: result._min.pricePerNight ?? 0, max: result._max.pricePerNight ?? 5000 };
}
