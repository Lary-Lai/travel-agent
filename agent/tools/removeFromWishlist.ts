import { tool } from "ai";
import { z } from "zod";

import {
  getWishlistsContaining,
  removeListingFromWishlist,
} from "../../server/wishlist.service";
import type { AgentContext } from "../types";
import { describeError, requireUserId, resolveListingId } from "./resolve";

export const removeFromWishlistSchema = z.object({
  listingId: z.string().optional().describe("房源 id"),
  position: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("上一次搜索结果中的序号，从 1 开始"),
  wishlistId: z.string().optional().describe("从哪个心愿单移除；不传则自动查找包含该房源的心愿单"),
});

/** removeFromWishlist — remove a listing from a wishlist. */
export function removeFromWishlistTool(context: AgentContext) {
  return tool({
    description:
      "把某个房源从当前用户的心愿单中移除。当用户说「取消收藏」「把这个房源从心愿单删掉」时使用。若未指定心愿单，会自动查找包含该房源的心愿单。",
    inputSchema: removeFromWishlistSchema,
    execute: async (input) => {
      const auth = requireUserId(context);
      if ("error" in auth) return { ok: false as const, error: auth.error };

      try {
        const resolved = resolveListingId(context.session, input);
        if ("error" in resolved) return { ok: false as const, error: resolved.error };

        let wishlistId = input.wishlistId;

        if (!wishlistId) {
          const containing = await getWishlistsContaining(auth.userId, resolved.id);
          if (containing.length === 0) {
            return {
              ok: false as const,
              error: "该房源不在你的任何心愿单中，无需移除。",
            };
          }
          // Ambiguous only when the user saved it in several places.
          if (containing.length > 1) {
            return {
              ok: false as const,
              error: `该房源同时存在于多个心愿单：${containing
                .map((w) => `「${w.name}」`)
                .join("、")}。请确认要从哪一个移除。`,
              candidates: containing,
            };
          }
          wishlistId = containing[0].id;
        }

        const wishlist = await removeListingFromWishlist(auth.userId, wishlistId, resolved.id);

        return {
          ok: true as const,
          wishlistId: wishlist.id,
          wishlistName: wishlist.name,
          itemCount: wishlist.itemCount,
          message: `已从心愿单「${wishlist.name}」移除该房源，该心愿单现在有 ${wishlist.itemCount} 个房源。`,
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
