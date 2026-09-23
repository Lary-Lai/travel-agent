/**
 * URL <-> search-criteria mapping.
 *
 * Deliberately lenient (unlike lib/validators.ts which guards the API): a bad
 * query string in the address bar should degrade to "filter ignored", never
 * crash the results page. The API still rejects contradictory input.
 */
import { SORT_OPTIONS, type ListingSearchInput, type PropertyTypeValue, type SortOption } from "../types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PROPERTY_TYPES: PropertyTypeValue[] = [
  "APARTMENT",
  "HOUSE",
  "HOTEL",
  "VILLA",
  "LOFT",
  "GUESTHOUSE",
];

const asString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === "string" && item.trim() !== "");
    return typeof found === "string" ? found.trim() : undefined;
  }
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
};

const asPositiveInt = (value: unknown, max: number): number | undefined => {
  const raw = asString(value);
  if (raw === undefined) return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return Math.min(Math.floor(num), max);
};

/** Parse Next's `searchParams` object into validated criteria. Never throws. */
export function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
): ListingSearchInput {
  const out: ListingSearchInput = {};

  const location = asString(params.location) ?? asString(params.q);
  if (location) out.location = location.slice(0, 80);

  const checkIn = asString(params.checkIn);
  if (checkIn && DATE_RE.test(checkIn)) out.checkIn = checkIn;

  const checkOut = asString(params.checkOut);
  if (checkOut && DATE_RE.test(checkOut)) out.checkOut = checkOut;

  // Ignore an inverted range rather than erroring the page.
  if (out.checkIn && out.checkOut && out.checkOut <= out.checkIn) {
    delete out.checkOut;
  }

  const guests = asPositiveInt(params.guests, 16);
  if (guests !== undefined && guests >= 1) out.guests = guests;

  const priceMin = asPositiveInt(params.priceMin, 100_000);
  if (priceMin !== undefined) out.priceMin = priceMin;

  const priceMax = asPositiveInt(params.priceMax, 100_000);
  if (priceMax !== undefined) out.priceMax = priceMax;

  if (out.priceMin !== undefined && out.priceMax !== undefined && out.priceMin > out.priceMax) {
    delete out.priceMin;
    delete out.priceMax;
  }

  const propertyType = asString(params.propertyType)?.toUpperCase();
  if (propertyType && (PROPERTY_TYPES as string[]).includes(propertyType)) {
    out.propertyType = propertyType as PropertyTypeValue;
  }

  const rawAmenities = params.amenities;
  const list = (Array.isArray(rawAmenities) ? rawAmenities : rawAmenities ? [rawAmenities] : [])
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((value) => value.trim())
    .filter(Boolean);
  if (list.length > 0) out.amenities = [...new Set(list)].slice(0, 10);

  const sort = asString(params.sort);
  if (sort && (SORT_OPTIONS as readonly string[]).includes(sort)) out.sort = sort as SortOption;

  const page = asPositiveInt(params.page, 10_000);
  if (page !== undefined && page >= 1) out.page = page;

  return out;
}

/** Serialise criteria into a query string (`""` when nothing is set). */
export function buildSearchQuery(input: ListingSearchInput): string {
  const params = new URLSearchParams();

  if (input.location) params.set("location", input.location);
  if (input.checkIn) params.set("checkIn", input.checkIn);
  if (input.checkOut) params.set("checkOut", input.checkOut);
  if (input.guests !== undefined) params.set("guests", String(input.guests));
  if (input.priceMin !== undefined) params.set("priceMin", String(input.priceMin));
  if (input.priceMax !== undefined) params.set("priceMax", String(input.priceMax));
  if (input.propertyType) params.set("propertyType", input.propertyType);
  if (input.amenities?.length) params.set("amenities", input.amenities.join(","));
  if (input.sort && input.sort !== "recommended") params.set("sort", input.sort);
  if (input.page && input.page > 1) params.set("page", String(input.page));

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** How many filters are active — shown on the mobile filter button. */
export function countActiveFilters(input: ListingSearchInput): number {
  let count = 0;
  if (input.location) count++;
  if (input.checkIn) count++;
  if (input.guests) count++;
  if (input.priceMin !== undefined || input.priceMax !== undefined) count++;
  if (input.propertyType) count++;
  count += input.amenities?.length ?? 0;
  return count;
}
