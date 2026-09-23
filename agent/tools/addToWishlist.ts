import { tool } from "ai";
import { z } from "zod";

import { addListingToWishlist, resolveTargetWishlist } from "../../server/wishlist.service";
import type { AgentContext } from "../types";
import { describeError, requireUserId, resolveListingId } from "./resolve";

export const addToWishlistSchema = z.object({
  listingId: z.string().optional().describe("房源 id（推荐直接传 id）"),
  position: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("上一次搜索结果中的序号，从 1 开始。用于「把刚才推荐的第一个房源收藏」这类请求"),
  wishlistId: z.string().optional().describe("目标心愿单 id"),
  wishlistName: z
    .string()
    .optional()
    .describe("目标心愿单名称，例如「东京旅行」。若不存在会按名称创建"),
});

/**
 * addToWishlist — the write path of the Agent demo.
 * Resolves both the listing and the target wishlist, then goes through the
 * wishlist service (which re-verifies ownership) and writes to PostgreSQL.
 */
export function addToWishlistTool(context: AgentContext) {
  return tool({
    description:
      "把某个房源加入当前用户的心愿单。当用户说「收藏这个」「把第一个加入东京旅行心愿单」时使用。支持用序号引用上一次搜索结果中的房源。",
    inputSchema: addToWishlistSchema,
    execute: async (input) => {
      const auth = requireUserId(context);
      if ("error" in auth) return { ok: false as const, error: auth.error };

      try {
        const resolvedListing = resolveListingId(context.session, input);
        if ("error" in resolvedListing) return { ok: false as const, error: resolvedListing.error };

        // Falls back to the user's oldest wishlist, creating one if needed.
        const target = await resolveTargetWishlist(auth.userId, {
          wishlistId: input.wishlistId,
          wishlistName: input.wishlistName,
        });

        const wishlist = await addListingToWishlist(
          auth.userId,
          target.id,
          resolvedListing.id,
        );

        const added = wishlist.items.find((item) => item.listingId === resolvedListing.id);

        return {
          ok: true as const,
          wishlistId: wishlist.id,
          wishlistName: wishlist.name,
          wishlistCreated: target.created,
          addedListing: added
            ? {
                id: added.listing.id,
                title: added.listing.title,
                city: added.listing.cityLabel,
                pricePerNight: added.listing.pricePerNight,
              }
            : null,
          itemCount: wishlist.itemCount,
          message: `已把房源加入心愿单「${wishlist.name}」，该心愿单现在有 ${wishlist.itemCount} 个房源。请提醒用户可以打开「我的心愿单」页面查看。`,
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
