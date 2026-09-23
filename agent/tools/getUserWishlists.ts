import { tool } from "ai";
import { z } from "zod";

import { listWishlists } from "../../server/wishlist.service";
import type { AgentContext } from "../types";
import { describeError, requireUserId } from "./resolve";

export const getUserWishlistsSchema = z.object({});

/** getUserWishlists — read the signed-in user's wishlists. */
export function getUserWishlistsTool(context: AgentContext) {
  return tool({
    description:
      "查看当前登录用户的所有心愿单，以及每个心愿单里已有的房源。当用户问「我的心愿单里有什么」「我收藏了哪些」或需要确定要把房源加到哪个心愿单时使用。",
    inputSchema: getUserWishlistsSchema,
    execute: async () => {
      const auth = requireUserId(context);
      if ("error" in auth) return { ok: false as const, error: auth.error };

      try {
        const wishlists = await listWishlists(auth.userId);

        return {
          ok: true as const,
          count: wishlists.length,
          wishlists: wishlists.map((wishlist) => ({
            id: wishlist.id,
            name: wishlist.name,
            itemCount: wishlist.itemCount,
            items: wishlist.items.map((item) => ({
              listingId: item.listingId,
              title: item.listing.title,
              city: item.listing.cityLabel,
              pricePerNight: item.listing.pricePerNight,
            })),
          })),
          hint:
            wishlists.length === 0
              ? "该用户还没有任何心愿单。可以主动询问是否要创建一个，例如「东京旅行」。"
              : "向用户说明各心愿单的名称与内容。",
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
