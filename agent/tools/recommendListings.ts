import { tool } from "ai";
import { z } from "zod";

import { searchListings } from "../../server/listing.service";
import { rememberListings } from "../session";
import type { AgentContext, ToolListing } from "../types";
import { toToolListing } from "../types";
import { describeError } from "./resolve";

/** Loose keyword -> amenity mapping so free-text preferences affect ranking. */
const PREFERENCE_AMENITIES: Array<{ keywords: string[]; amenity: string }> = [
  { keywords: ["地铁", "交通", "subway", "transit", "station", "出行"], amenity: "地铁附近" },
  { keywords: ["厨房", "做饭", "cook", "kitchen"], amenity: "厨房" },
  { keywords: ["办公", "工作", "workspace", "remote", "出差"], amenity: "专用办公区" },
  { keywords: ["宠物", "pet"], amenity: "可带宠物" },
  { keywords: ["婴儿", "亲子", "家庭", "family", "kid", "儿童"], amenity: "婴儿床" },
  { keywords: ["泳池", "游泳", "pool"], amenity: "游泳池" },
  { keywords: ["早餐", "breakfast"], amenity: "含早餐" },
  { keywords: ["停车", "自驾", "parking", "car"], amenity: "免费停车" },
];

function matchedAmenities(preferences: string[]): string[] {
  const wanted = new Set<string>();
  for (const preference of preferences) {
    const text = preference.toLowerCase();
    for (const rule of PREFERENCE_AMENITIES) {
      if (rule.keywords.some((keyword) => text.includes(keyword))) wanted.add(rule.amenity);
    }
  }
  return [...wanted];
}

export const recommendListingsSchema = z.object({
  location: z.string().describe("目的地，例如「东京」"),
  guests: z.number().int().min(1).max(16).optional().describe("入住人数"),
  budgetPerNight: z.number().optional().describe("每晚预算（人民币）"),
  preferences: z
    .array(z.string())
    .optional()
    .describe("用户的偏好描述，例如 ['交通方便','离地铁近']、['适合家庭']、['需要办公区']"),
  count: z.number().int().min(1).max(6).optional().describe("推荐数量，默认 3"),
  checkIn: z.string().optional().describe("入住日期 YYYY-MM-DD"),
  checkOut: z.string().optional().describe("退房日期 YYYY-MM-DD"),
});

/**
 * recommendListings — search, then rank and explain.
 *
 * Ranking happens here (deterministic, explainable) rather than in the prompt,
 * so the recommendation is grounded in real data and each pick carries a reason.
 */
export function recommendListingsTool(context: AgentContext, sessionId: string) {
  return tool({
    description:
      "根据用户需求推荐若干房源，并给出每个推荐的理由。当用户说「帮我选几个」「推荐一下」「哪几个合适」时使用。会结合预算匹配度、评分、口碑、交通与设施偏好综合排序。",
    inputSchema: recommendListingsSchema,
    execute: async (input) => {
      try {
        const count = input.count ?? 3;
        const preferences = input.preferences ?? [];
        const wantedAmenities = matchedAmenities(preferences);

        // Search a slightly wider net than the final answer so ranking has room.
        const budget = input.budgetPerNight;
        const result = await searchListings({
          location: input.location,
          guests: input.guests,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          priceMin: budget !== undefined ? Math.round(budget * 0.6) : undefined,
          priceMax: budget !== undefined ? Math.round(budget * 1.4) : undefined,
          amenities: wantedAmenities.length > 0 ? wantedAmenities : undefined,
          sort: "rating_desc",
          page: 1,
          pageSize: 24,
        });

        // If strict amenity filtering was too aggressive, retry without it.
        let candidates = result.items;
        let relaxed = false;
        if (candidates.length < count && wantedAmenities.length > 0) {
          const relaxedResult = await searchListings({
            location: input.location,
            guests: input.guests,
            checkIn: input.checkIn,
            checkOut: input.checkOut,
            priceMin: budget !== undefined ? Math.round(budget * 0.6) : undefined,
            priceMax: budget !== undefined ? Math.round(budget * 1.6) : undefined,
            sort: "rating_desc",
            page: 1,
            pageSize: 24,
          });
          candidates = relaxedResult.items;
          relaxed = true;
        }

        if (candidates.length === 0) {
          return {
            ok: true as const,
            recommendations: [],
            totalConsidered: 0,
            hint: "该目的地没有找到候选房源，请建议用户更换目的地或放宽预算。",
          };
        }

        const scored = candidates.map((listing) => {
          const toolListing = toToolListing(listing);
          let score = 0;
          const reasons: string[] = [];

          // Rating & social proof.
          score += (listing.rating - 4) * 25;
          score += Math.min(listing.reviewCount, 300) / 30;
          if (listing.rating >= 4.8) reasons.push(`评分高达 ${listing.rating.toFixed(1)}`);
          else if (listing.rating >= 4.6) reasons.push(`评分 ${listing.rating.toFixed(1)}，口碑不错`);
          if (listing.reviewCount >= 200) reasons.push(`${listing.reviewCount} 条真实评价`);

          // Budget fit — reward being close to (but not over) the stated budget.
          if (budget !== undefined) {
            const ratio = listing.pricePerNight / budget;
            if (ratio <= 1) {
              score += 30 * (1 - Math.abs(1 - ratio));
              reasons.push(`每晚 ¥${listing.pricePerNight}，在预算内`);
            } else {
              score -= 40 * (ratio - 1);
              reasons.push(`每晚 ¥${listing.pricePerNight}，略超预算`);
            }
          } else {
            score += Math.max(0, 20 - listing.pricePerNight / 100);
          }

          // Preference amenities.
          for (const amenity of wantedAmenities) {
            if (toolListing.amenities.includes(amenity)) {
              score += 18;
              if (amenity === "地铁附近") reasons.push("步行可达地铁站，交通方便");
              else reasons.push(`配备${amenity}`);
            } else if (!relaxed) {
              score -= 10;
            }
          }

          // Capacity fit: prefer a snug fit over a vastly oversized place.
          if (input.guests) {
            const slack = listing.maxGuests - input.guests;
            if (slack === 0 || slack === 1 || slack === 2) {
              score += 12;
              reasons.push(`可住 ${listing.maxGuests} 人，正合适`);
            } else if (slack < 0) {
              score -= 100;
            }
          }

          return { toolListing, score, reasons: reasons.slice(0, 3) };
        });

        const recommendations = scored
          .sort((a, b) => b.score - a.score)
          .slice(0, count)
          .map((entry, index) => ({
            rank: index + 1,
            reason: entry.reasons.join("；") || "综合评分与口碑较优",
            ...entry.toolListing,
          }));

        rememberListings(sessionId, recommendations.map((r) => r.id), input.location);

        return {
          ok: true as const,
          totalConsidered: candidates.length,
          relaxedFilters: relaxed,
          wantedAmenities,
          recommendations,
          hint: "已按推荐顺序返回，第 1 个为排名最高的房源。请用中文说明推荐理由，并提醒用户可以查看详情或收藏。",
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}

export type { ToolListing };
