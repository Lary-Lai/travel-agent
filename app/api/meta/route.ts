import { handler, ok } from "@/lib/http";
import { getAmenityDictionary, getCityStats, getPriceBounds } from "@/server/listing.service";

/**
 * GET /api/meta
 * Dictionary data for the search/filter UI: destinations, amenity list and the
 * absolute price bounds used to seed the price slider. Public.
 */
export const GET = handler(async () => {
  const [cities, amenities, priceBounds] = await Promise.all([
    getCityStats(),
    getAmenityDictionary(),
    getPriceBounds(),
  ]);

  return ok({ cities, amenities, priceBounds });
});
