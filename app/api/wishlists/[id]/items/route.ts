import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { badRequest, handler, ok } from "@/lib/http";
import { wishlistItemSchema } from "@/lib/validators";
import { addListingToWishlist, removeListingFromWishlist } from "@/server/wishlist.service";

type Context = { params: Promise<{ id: string }> };

/** POST /api/wishlists/:id/items — add a listing. Owner only. */
export const POST = handler(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { listingId } = wishlistItemSchema.parse(body);

  const wishlist = await addListingToWishlist(user.id, id, listingId);
  return ok({ wishlist }, { status: 201 });
});

/**
 * DELETE /api/wishlists/:id/items?listingId=...
 * Remove a listing from the wishlist. Owner only.
 */
export const DELETE = handler(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;

  const listingId = request.nextUrl.searchParams.get("listingId")?.trim();
  if (!listingId) throw badRequest("缺少 listingId 查询参数");

  const wishlist = await removeListingFromWishlist(user.id, id, listingId);
  return ok({ wishlist });
});
