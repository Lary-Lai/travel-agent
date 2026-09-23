import { tool } from "ai";
import { z } from "zod";

import { getListingDetail } from "../../server/listing.service";
import type { AgentContext } from "../types";
import { toToolListing } from "../types";
import { describeError, resolveListingId } from "./resolve";

export const getListingDetailSchema = z.object({
  listingId: z.string().optional().describe("房源 id（推荐直接传 id）"),
  position: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("也可以传序号，表示上一次搜索结果中的第几个房源，从 1 开始"),
});

/** getListingDetail — full detail for one listing. */
export function getListingDetailTool(context: AgentContext) {
  return tool({
    description:
      "获取单个房源的完整信息：完整介绍、全部设施、房东信息、房型细节等。当用户询问某个房源的具体情况，或需要更详细信息来做判断时使用。",
    inputSchema: getListingDetailSchema,
    execute: async (input) => {
      try {
        const resolved = resolveListingId(context.session, input);
        if ("error" in resolved) return { ok: false as const, error: resolved.error };

        const detail = await getListingDetail(resolved.id);

        return {
          ok: true as const,
          listing: {
            ...toToolListing(detail),
            description: detail.description,
            host: {
              name: detail.host.name,
              listingCount: detail.host.listingCount,
              joinedAt: detail.host.joinedAt.slice(0, 10),
            },
            allAmenities: detail.amenities.map((a) => a.name),
            imageCount: detail.images.length,
          },
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
