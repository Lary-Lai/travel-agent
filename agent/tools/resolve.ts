import type { AgentContext, AgentSessionState } from "../types";

/**
 * Resolve a listing reference the model produced into a concrete listing id.
 *
 * The model may quote an id it saw in an earlier tool result, or refer to a
 * position ("the first one") in the most recent result set. Both are supported
 * so follow-up turns work naturally.
 */
export function resolveListingId(
  session: AgentSessionState,
  reference: { listingId?: string; position?: number },
): { id: string } | { error: string } {
  if (reference.listingId) return { id: reference.listingId };

  if (typeof reference.position === "number") {
    const index = reference.position - 1;
    const id = session.lastListingIds[index];
    if (!id) {
      return {
        error:
          session.lastListingIds.length === 0
            ? "当前对话还没有搜索结果，请先让助手搜索或推荐房源。"
            : `只找到 ${session.lastListingIds.length} 个房源，无法定位第 ${reference.position} 个。`,
      };
    }
    return { id };
  }

  return { error: "请提供 listingId，或提供 position 表示第几个结果。" };
}

/** Force a tool to require a signed-in user, with a friendly message. */
export function requireUserId(context: AgentContext): { userId: string } | { error: string } {
  if (!context.userId) {
    return { error: "该操作需要登录后才能进行，请先登录再让我帮你操作心愿单。" };
  }
  return { userId: context.userId };
}

/** Normalise any thrown value into a readable message for the model. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "工具执行失败，请稍后重试。";
}
