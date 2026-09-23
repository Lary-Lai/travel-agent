import { tool } from "ai";
import { z } from "zod";

import { createWishlist } from "../../server/wishlist.service";
import type { AgentContext } from "../types";
import { describeError, requireUserId } from "./resolve";

export const createWishlistSchema = z.object({
  name: z.string().min(1).max(60).describe("心愿单名称，例如「东京旅行」「欧洲之旅」"),
});

/** createWishlist — create a new wishlist for the signed-in user. */
export function createWishlistTool(context: AgentContext) {
  return tool({
    description:
      "为当前登录用户创建一个新的心愿单。当用户说「创建一个东京旅行心愿单」「新建一个收藏夹」时使用。如果需要把房源加到还不存在的心愿单，也可以先创建再添加。",
    inputSchema: createWishlistSchema,
    execute: async (input) => {
      const auth = requireUserId(context);
      if ("error" in auth) return { ok: false as const, error: auth.error };

      try {
        const wishlist = await createWishlist(auth.userId, input.name);
        return {
          ok: true as const,
          wishlist: { id: wishlist.id, name: wishlist.name, itemCount: wishlist.itemCount },
          message: `已创建心愿单「${wishlist.name}」。`,
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
