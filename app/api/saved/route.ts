import { requireUser } from "@/lib/auth";
import { getSavedListingIds, getWishlistsContaining } from "@/server/wishlist.service";
import { handler, ok } from "@/lib/http";

/**
 * GET /api/saved
 * Listing ids the signed-in user has saved, plus — when `?listingId=` is given
 * — which wishlists contain that listing. Powers the heart icons.
 */
export const GET = handler(async (request: Request) => {
  const user = await requireUser();

  const listingId = new URL(request.url).searchParams.get("listingId")?.trim();

  const [listingIds, containing] = await Promise.all([
    getSavedListingIds(user.id),
    listingId ? getWishlistsContaining(user.id, listingId) : Promise.resolve([]),
  ]);

  return ok({ listingIds, wishlistsContaining: containing });
});
