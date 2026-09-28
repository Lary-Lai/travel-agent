import { tool } from "ai";
import { z } from "zod";

import { getSearchInsights } from "../../server/personalization.service";
import type { AgentContext } from "../types";
import { describeError, requireUserId } from "./resolve";

export const getMySearchHistorySchema = z.object({});

/**
 * getMySearchHistory — what this user has been looking for.
 *
 * This is what makes recommendations *follow the user's history*: instead of
 * guessing a destination from the current sentence alone, the agent can see
 * which cities the person keeps searching and lean on that.
 *
 * Signed-out callers get an explicit `ok: false` rather than invented data —
 * there is no history to read, and fabricating one would be worse than saying so.
 */
export function getMySearchHistoryTool(context: AgentContext) {
  return tool({
    description:
      "读取当前登录用户的搜索记录，得到他最关注的目的地。当用户说「给我推荐」「随便推荐一下」「有什么适合我的」或没有明确目的地就想让你推荐时，先调用这个工具，再据此推荐。",
    inputSchema: getMySearchHistorySchema,
    execute: async () => {
      const auth = requireUserId(context);
      if ("error" in auth) {
        return {
          ok: false as const,
          error: auth.error,
          hint: "用户未登录，没有搜索记录。请直接询问他感兴趣的城市。",
        };
      }

      try {
        const insights = await getSearchInsights(auth.userId);

        return {
          ok: true as const,
          totalSearches: insights.totalSearches,
          personalised: insights.topCities.length > 0,
          topCities: insights.topCities,
          summary: insights.summary,
          hint:
            insights.topCities.length === 0
              ? "该用户还没有搜索记录，请直接询问他想去哪里，或推荐热门城市。"
              : "推荐时请优先围绕这些城市展开，并说明是根据他的搜索记录得出的。",
        };
      } catch (error) {
        return { ok: false as const, error: describeError(error) };
      }
    },
  });
}
