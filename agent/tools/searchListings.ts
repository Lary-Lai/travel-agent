import { tool } from "ai";
import { z } from "zod";

import { searchListings } from "../../server/listing.service";
import { rememberListings } from "../session";
import type { AgentContext } from "../types";
import { toToolListing } from "../types";
import { describeError } from "./resolve";

/** "Around ¥800/night" is interpreted as a ±30% band. */
const BUDGET_TOLERANCE = 0.3;

export const searchListingsSchema = z.object({
  location: z
    .string()
    .optional()
    .describe("目的地，可用中文或英文，例如「东京」「Tokyo」「涩谷」「巴黎」"),
  checkIn: z.string().optional().describe("入住日期，格式 YYYY-MM-DD"),
  checkOut: z.string().optional().describe("退房日期，格式 YYYY-MM-DD"),
  guests: z.number().int().min(1).max(16).optional().describe("入住人数"),
  budgetPerNight: z
    .number()
    .optional()
    .describe("每晚预算（人民币）。当用户说「800 左右」时传 800，会自动匹配 ±30% 区间"),
  priceMin: z.number().optional().describe("每晚最低价；只有用户给出明确下限时才使用"),
  priceMax: z.number().optional().describe("每晚最高价；只有用户给出明确上限时才使用"),
  propertyType: z
    .enum(["APARTMENT", "HOUSE", "HOTEL", "VILLA", "LOFT", "GUESTHOUSE"])
    .optional()
    .describe("房源类型"),
  amenities: z
    .array(z.string())
    .optional()
    .describe("必须包含的设施，例如 ['地铁附近']、['无线网络','厨房']"),
  sort: z
    .enum(["recommended", "price_asc", "price_desc", "rating_desc"])
    .optional()
    .describe("排序方式，默认 recommended"),
  limit: z.number().int().min(1).max(12).optional().describe("返回条数，默认 6"),
});

/**
 * searchListings — query real listings through the listing service.
 * This is the tool behind both natural-language search and recommendations.
 */
export function searchListingsTool(context: AgentContext, sessionId: string) {
  return tool({
    description:
      "根据目的地、日期、人数、预算、房源类型和设施搜索真实房源。返回符合条件的房源列表（含 id、价格、评分、可住人数等）。当用户描述旅行需求（去哪里、几个人、预算多少、想住什么样的房子）时使用此工具。",
    inputSchema: searchListingsSchema,
    execute: async (input) => {
      try {
        const limit = input.limit ?? 6;

        // Turn an approximate budget into a price band unless the user was explicit.
        let priceMin = input.priceMin;
        let priceMax = input.priceMax;
        let budgetBand: { min: number; max: number } | null = null;

        if (
          input.budgetPerNight !== undefined &&
          priceMin === undefined &&
          priceMax === undefined
        ) {
          const min = Math.max(0, Math.round(input.budgetPerNight * (1 - BUDGET_TOLERANCE)));
          const max = Math.round(input.budgetPerNight * (1 + BUDGET_TOLERANCE));
          priceMin = min;
          priceMax = max;
          budgetBand = { min, max };
        }

        const result = await searchListings({
          location: input.location,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          guests: input.guests,
          priceMin,
          priceMax,
          propertyType: input.propertyType,
          amenities: input.amenities,
          sort: input.sort ?? "recommended",
          page: 1,
          pageSize: limit,
        });

        const listings = result.items.map(toToolListing);
        rememberListings(sessionId, listings.map((l) => l.id), input.location ?? null);

        return {
          ok: true as const,
          total: result.total,
          returned: listings.length,
          criteria: {
            location: input.location ?? null,
            guests: input.guests ?? null,
            checkIn: input.checkIn ?? null,
            checkOut: input.checkOut ?? null,
            budgetPerNight: input.budgetPerNight ?? null,
            budgetBand,
            priceMin: priceMin ?? null,
            priceMax: priceMax ?? null,
            propertyType: input.propertyType ?? null,
            amenities: input.amenities ?? [],
          },
          listings,
          // An empty result is a normal outcome, not an error — the model should
          // suggest relaxing a constraint rather than retrying blindly.
          hint:
            listings.length === 0
              ? "没有匹配的房源。请建议用户放宽预算、减少设施要求或更换目的地，然后可以再次调用本工具。"
              : "结果已按顺序返回，第 1 个为第一个房源。",
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
