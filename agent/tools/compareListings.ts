import { tool } from "ai";
import { z } from "zod";

import { getListingDetail } from "../../server/listing.service";
import type { AgentContext } from "../types";
import { describeError, resolveListingId } from "./resolve";

export const compareListingsSchema = z.object({
  listingIds: z.array(z.string()).optional().describe("要比较的房源 id 列表"),
  positions: z
    .array(z.number().int().min(1))
    .optional()
    .describe("也可以传序号列表，对应上一次搜索结果中的第几个，从 1 开始"),
  guests: z.number().int().min(1).max(16).optional().describe("实际入住人数，用于比较是否合适"),
  nights: z.number().int().min(1).max(60).optional().describe("入住晚数，用于比较总价"),
});

/**
 * compareListings — fetch real details for 2-4 listings and compute an
 * objective, side-by-side comparison. The model then narrates the verdict from
 * these facts rather than inventing numbers.
 */
export function compareListingsTool(context: AgentContext) {
  return tool({
    description:
      "对比 2-4 个房源，基于真实数据给出价格、评分、入住人数、房间数量、地理位置、交通便利度与设施的结构化对比，并标出最便宜、评分最高、最适合多人等结论。当用户问「哪个更好」「比较一下」时使用。",
    inputSchema: compareListingsSchema,
    execute: async (input) => {
      try {
        // Resolve references into concrete ids, preserving order.
        const ids: string[] = [];
        const problems: string[] = [];

        for (const id of input.listingIds ?? []) {
          const resolved = resolveListingId(context.session, { listingId: id });
          if ("error" in resolved) problems.push(resolved.error);
          else ids.push(resolved.id);
        }
        for (const position of input.positions ?? []) {
          const resolved = resolveListingId(context.session, { position });
          if ("error" in resolved) problems.push(resolved.error);
          else ids.push(resolved.id);
        }

        const unique = [...new Set(ids)];
        if (unique.length === 0) {
          return {
            ok: false as const,
            error:
              problems[0] ??
              "没有可比较的房源。请先搜索或推荐房源，再进行比较；也可以直接提供房源 id。",
          };
        }
        if (unique.length === 1) {
          return {
            ok: false as const,
            error: "只提供了一个房源，至少需要两个房源才能比较。",
          };
        }
        if (unique.length > 4) {
          return { ok: false as const, error: "一次最多比较 4 个房源，请减少数量后重试。" };
        }

        const details = await Promise.all(unique.map((id) => getListingDetail(id)));
        const nights = input.nights;
        const guests = input.guests;

        const compared = details.map((detail) => {
          const perNight = detail.pricePerNight;
          return {
            id: detail.id,
            title: detail.title,
            city: detail.cityLabel,
            location: detail.location,
            image: detail.image,
            pricePerNight: perNight,
            totalForStay: nights ? perNight * nights : null,
            pricePerGuestPerNight: guests ? Math.round(perNight / guests) : null,
            rating: detail.rating,
            reviewCount: detail.reviewCount,
            maxGuests: detail.maxGuests,
            bedrooms: detail.bedrooms,
            beds: detail.beds,
            bathrooms: detail.bathrooms,
            propertyType: detail.propertyTypeLabel,
            nearSubway: detail.amenityNames.includes("地铁附近"),
            amenityCount: detail.amenities.length,
            keyAmenities: detail.amenities.slice(0, 8).map((a) => a.name),
            fitsGroup: guests ? detail.maxGuests >= guests : null,
            capacitySlack: guests ? detail.maxGuests - guests : null,
            url: `/listings/${detail.id}`,
          };
        });

        // Objective winners — computed, not guessed.
        const cheapest = compared.reduce((best, item) =>
          item.pricePerNight < best.pricePerNight ? item : best,
        );
        const bestRated = compared.reduce((best, item) =>
          item.rating > best.rating ? item : best,
        );
        const mostSpacious = compared.reduce((best, item) =>
          item.maxGuests > best.maxGuests ? item : best,
        );
        const mostReviewed = compared.reduce((best, item) =>
          item.reviewCount > best.reviewCount ? item : best,
        );
        const bestValue = compared.reduce((best, item) => {
          const score = (entry: typeof item) =>
            entry.rating / Math.max(entry.pricePerNight, 1) + (entry.nearSubway ? 0.0008 : 0);
          return score(item) > score(best) ? item : best;
        });

        const groupWarnings = guests
          ? compared
              .filter((item) => item.maxGuests < guests)
              .map((item) => `${item.title} 最多可住 ${item.maxGuests} 人，无法容纳 ${guests} 人`)
          : [];

        return {
          ok: true as const,
          guests: guests ?? null,
          nights: nights ?? null,
          compared,
          objectiveWinners: {
            cheapest: { id: cheapest.id, title: cheapest.title, pricePerNight: cheapest.pricePerNight },
            bestRated: { id: bestRated.id, title: bestRated.title, rating: bestRated.rating },
            largestCapacity: {
              id: mostSpacious.id,
              title: mostSpacious.title,
              maxGuests: mostSpacious.maxGuests,
            },
            mostReviewed: {
              id: mostReviewed.id,
              title: mostReviewed.title,
              reviewCount: mostReviewed.reviewCount,
            },
            bestValue: { id: bestValue.id, title: bestValue.title },
          },
          groupWarnings,
          problems,
          hint: "请基于这些真实数据用中文给出对比结论，说明各自适合什么情况，并推荐最适合用户需求的一个。不要编造未提供的数字。",
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
