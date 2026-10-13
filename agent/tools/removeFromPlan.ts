import { tool } from "ai";
import { z } from "zod";

import { getPlan, removePlanItem } from "../../server/plan.service";
import type { AgentContext } from "../types";
import { describeError, requireUserId, resolveListingId } from "./resolve";

export const removeFromPlanSchema = z.object({
  listingId: z.string().optional().describe("要移出的房源 id"),
  position: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("上一次搜索结果中的序号，从 1 开始（也用于引用行程里提到的房源）"),
});

/**
 * removeFromPlan.
 *
 * Removing something that is not there reports `removed: 0` rather than failing: the
 * user's intent ("this should not be in my plan") is satisfied either way, and an error
 * would push the model into apologising for a state the user already wanted.
 */
export function removeFromPlanTool(context: AgentContext) {
  return tool({
    description:
      "把某个房源从用户的行程草稿中移出。当用户说「这个不要了」「把第二天那家删掉」时使用。支持用序号引用上一次搜索结果中的房源。",
    inputSchema: removeFromPlanSchema,
    execute: async (input) => {
      const auth = requireUserId(context);
      if ("error" in auth) return { ok: false as const, error: auth.error };

      try {
        const resolved = resolveListingId(context.session, input);
        if ("error" in resolved) return { ok: false as const, error: resolved.error };

        const removed = await removePlanItem(auth.userId, { listingId: resolved.id });
        const items = await getPlan(auth.userId);

        return {
          ok: true as const,
          removed,
          totalItems: items.length,
          remainingDays: [...new Set(items.map((item) => item.day))].sort((a, b) => a - b),
          message:
            removed > 0
              ? `已从行程中移出该房源，行程还剩 ${items.length} 个。`
              : "这个房源本来就不在行程里，无需改动。",
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
