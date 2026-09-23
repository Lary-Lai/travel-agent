import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { renameWishlistSchema } from "@/lib/validators";
import { deleteWishlist, getWishlist, renameWishlist } from "@/server/wishlist.service";

type Context = { params: Promise<{ id: string }> };

/** GET /api/wishlists/:id — one wishlist with its listings. Owner only. */
export const GET = handler(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const wishlist = await getWishlist(user.id, id);
  return ok({ wishlist });
});

/** PATCH /api/wishlists/:id — rename. Owner only. */
export const PATCH = handler(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { name } = renameWishlistSchema.parse(body);

  const wishlist = await renameWishlist(user.id, id, name);
  return ok({ wishlist });
});

/** DELETE /api/wishlists/:id — delete (items cascade). Owner only. */
export const DELETE = handler(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;

  await deleteWishlist(user.id, id);
  return ok({ deleted: true, id });
});
