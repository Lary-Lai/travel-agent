import { tool } from "ai";
import { z } from "zod";

import { MAX_PLAN_DAY } from "../../lib/plan-limits";
import { getPlan, putPlanItem } from "../../server/plan.service";
import type { AgentContext } from "../types";
import { describeError, requireUserId, resolveListingId } from "./resolve";

export const addToPlanSchema = z.object({
  listingId: z.string().optional().describe("房源 id（推荐直接传 id）"),
  position: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("上一次搜索结果中的序号，从 1 开始。用于「把第三个加进行程」这类请求"),
  day: z
    .number()
    .int()
    .min(1)
    .max(MAX_PLAN_DAY)
    .optional()
    .describe(`放在第几天，从 1 开始，默认第 1 天。上限 ${MAX_PLAN_DAY}`),
  note: z.string().optional().describe("备注，例如「下午到，先放行李」"),
});

/**
 * addToPlan — the write half, and the tool that makes this an assistant rather than a
 * chat window.
 *
 * Two things it does deliberately:
 *
 *  - **Same listing, same slot.** The service upserts on `(userId, listingId)`, so
 *    "actually make that day 3" moves the item. A model told to "add" again cannot
 *    silently produce a duplicate.
 *  - **It answers with the whole plan.** The model needs to see the day it just changed
 *    in order to say anything useful about it, and the tool result is the only thing it
 *    can see.
 */
export function addToPlanTool(context: AgentContext) {
  return tool({
    description:
      "把某个房源加入用户的行程草稿，可以指定第几天（默认第 1 天）。当用户说「把这个加进行程」「第二天住这家」时使用。支持用序号引用上一次搜索结果中的房源。同一房源再次加入会改到新的那一天，不会重复。",
    inputSchema: addToPlanSchema,
    execute: async (input) => {
      const auth = requireUserId(context);
      if ("error" in auth) return { ok: false as const, error: auth.error };

      try {
        const resolved = resolveListingId(context.session, input);
        if ("error" in resolved) return { ok: false as const, error: resolved.error };

        const day = input.day ?? 1;
        const item = await putPlanItem(auth.userId, resolved.id, day, input.note ?? null);
        const items = await getPlan(auth.userId);
        const dayItems = items.filter((entry) => entry.day === item.day);

        return {
          ok: true as const,
          moved: item.day === day,
          added: {
            listingId: item.listing.id,
            title: item.listing.title,
            city: item.listing.city,
            day: item.day,
            note: item.note,
            pricePerNight: item.listing.pricePerNight,
          },
          daySummary: dayItems.map((entry) => entry.listing.title),
          totalItems: items.length,
          message: `已把「${item.listing.title}」放到第 ${item.day} 天，第 ${item.day} 天现在有 ${dayItems.length} 个房源，行程总计 ${items.length} 个。`,
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
