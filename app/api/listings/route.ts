import type { NextRequest } from "next/server";

import { handler, ok } from "@/lib/http";
import { parseListingSearch, searchParamsToObject } from "@/lib/validators";
import { searchListings } from "@/server/listing.service";

/**
 * GET /api/listings
 * Search listings. Public. Supports the full filter set used by /search so the
 * same criteria can come from the URL, from TanStack Query, or from the Agent.
 */
export const GET = handler(async (request: NextRequest) => {
  const input = parseListingSearch(searchParamsToObject(request.nextUrl.searchParams));
  const result = await searchListings(input);
  return ok(result);
});
