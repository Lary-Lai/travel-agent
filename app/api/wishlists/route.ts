import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { createWishlistSchema } from "@/lib/validators";
import { createWishlist, listWishlists } from "@/server/wishlist.service";

/**
 * GET /api/wishlists
 * Returns the SIGNED-IN user's wishlists. The user id comes from the session
 * cookie only — never from a query parameter.
 */
export const GET = handler(async () => {
  const user = await requireUser();
  const wishlists = await listWishlists(user.id);
  return ok({ wishlists });
});

/** POST /api/wishlists — create a wishlist for the signed-in user. */
export const POST = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const { name } = createWishlistSchema.parse(body);

  const wishlist = await createWishlist(user.id, name);
  return ok({ wishlist }, { status: 201 });
});
