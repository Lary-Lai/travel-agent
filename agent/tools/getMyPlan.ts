import { tool } from "ai";
import { z } from "zod";

import { getPlan } from "../../server/plan.service";
import type { AgentContext } from "../types";
import { describeError, requireUserId } from "./resolve";

export const getMyPlanSchema = z.object({});

/**
 * getMyPlan — the read half of the itinerary tools.
 *
 * Every other planning request needs this first: advice about a plan that the assistant
 * has not read is advice about a plan that does not exist. The tool description says so
 * explicitly, because that is the one thing the model cannot infer from the schema.
 */
export function getMyPlanTool(context: AgentContext) {
  return tool({
    description:
      "读取当前用户的行程草稿（按天分组的房源清单）。在推荐、讨论或修改行程之前先调用它，这样建议才是基于用户已有的安排，而不是凭空生成。",
    inputSchema: getMyPlanSchema,
    execute: async () => {
      const auth = requireUserId(context);
      if ("error" in auth) return { ok: false as const, error: auth.error };

      try {
        const items = await getPlan(auth.userId);
        const days = [...new Set(items.map((item) => item.day))].sort((a, b) => a - b);

        return {
          ok: true as const,
          itemCount: items.length,
          dayCount: days.length,
          days: days.map((day) => ({
            day,
            items: items
              .filter((item) => item.day === day)
              .map((item) => ({
                listingId: item.listing.id,
                title: item.listing.title,
                city: item.listing.city,
                location: item.listing.location,
                pricePerNight: item.listing.pricePerNight,
              })),
          })),
          message:
            items.length === 0
              ? "用户的行程还是空的。可以主动提议用 searchListings / recommendListings 找房源，再用 addToPlan 加进来。"
              : `行程共 ${items.length} 个房源，分布在 ${days.length} 天。`,
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
