import type { AgentContext } from "../types";
import { addToPlanTool } from "./addToPlan";
import { addToWishlistTool } from "./addToWishlist";
import { compareListingsTool } from "./compareListings";
import { createWishlistTool } from "./createWishlist";
import { getListingDetailTool } from "./getListingDetail";
import { getMyPlanTool } from "./getMyPlan";
import { getMySearchHistoryTool } from "./getMySearchHistory";
import { getUserWishlistsTool } from "./getUserWishlists";
import { recommendListingsTool } from "./recommendListings";
import { removeFromPlanTool } from "./removeFromPlan";
import { removeFromWishlistTool } from "./removeFromWishlist";
import { searchListingsTool } from "./searchListings";

/**
 * Build the tool set for one request.
 *
 * Tools are created per request so each one closes over the caller's identity
 * and conversation memory. Every tool calls the Service layer — no tool ever
 * touches Prisma directly.
 */
export function createAgentTools(context: AgentContext, sessionId: string) {
  return {
    searchListings: searchListingsTool(context, sessionId),
    getListingDetail: getListingDetailTool(context),
    recommendListings: recommendListingsTool(context, sessionId),
    compareListings: compareListingsTool(context),
    getMySearchHistory: getMySearchHistoryTool(context),
    getUserWishlists: getUserWishlistsTool(context),
    createWishlist: createWishlistTool(context),
    addToWishlist: addToWishlistTool(context),
    removeFromWishlist: removeFromWishlistTool(context),
    getMyPlan: getMyPlanTool(context),
    addToPlan: addToPlanTool(context),
    removeFromPlan: removeFromPlanTool(context),
  };
}

/** Tool names, used by the UI to label execution steps. */
export const AGENT_TOOL_LABELS: Record<string, string> = {
  searchListings: "搜索房源",
  getListingDetail: "读取房源详情",
  recommendListings: "生成推荐",
  compareListings: "对比房源",
  getMySearchHistory: "读取搜索记录",
  getUserWishlists: "读取心愿单",
  createWishlist: "创建心愿单",
  addToWishlist: "加入心愿单",
  removeFromWishlist: "移出心愿单",
  getMyPlan: "读行程",
  addToPlan: "加进行程",
  removeFromPlan: "移出行程",
};

export {
  addToPlanTool,
  addToWishlistTool,
  compareListingsTool,
  createWishlistTool,
  getListingDetailTool,
  getMyPlanTool,
  getMySearchHistoryTool,
  getUserWishlistsTool,
  recommendListingsTool,
  removeFromPlanTool,
  removeFromWishlistTool,
  searchListingsTool,
};
