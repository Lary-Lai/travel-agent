import type { UIMessage } from "ai";
import type { NextRequest } from "next/server";

import { runAgent } from "@/agent/agent";
import { getAiConfig } from "@/agent/provider";
import { getCurrentUser } from "@/lib/auth";
import { ApiError, badRequest, errorResponse, ok } from "@/lib/http";

/** Guards against an unbounded conversation being replayed every turn. */
const MAX_MESSAGES = 40;

/**
 * GET /api/agent
 * Reports whether a model is configured. Deliberately never returns the key.
 */
export async function GET() {
  const config = getAiConfig();
  return ok({ configured: config.configured, model: config.model, problem: config.problem });
}

/**
 * POST /api/agent
 * Streams an Agent turn. The signed-in user (if any) is resolved from the
 * session cookie — never from the request body — so wishlist tools can only
 * ever act on the caller's own data.
 */
export async function POST(request: NextRequest) {
  try {
    const config = getAiConfig();
    if (!config.configured) {
      throw new ApiError(503, "AI_NOT_CONFIGURED", config.problem ?? "AI 模型未配置");
    }

    const user = await getCurrentUser();

    const body = (await request.json().catch(() => null)) as
      | { messages?: unknown; sessionId?: unknown }
      | null;

    if (!body || !Array.isArray(body.messages)) {
      throw badRequest("请求缺少 messages 字段");
    }

    // Validated structurally but not stripped: UIMessages carry `parts`, and a
    // schema with unknown-key stripping would silently destroy the payload.
    const messages = body.messages as UIMessage[];
    if (messages.length === 0) throw badRequest("至少需要一条消息");
    if (messages.length > MAX_MESSAGES) throw badRequest("对话过长，请开启新对话");

    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.trim().length > 0
        ? body.sessionId.trim().slice(0, 100)
        : "anonymous";

    const result = await runAgent({ messages, userId: user?.id ?? null, sessionId });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        // Surfaced to the client as an error part, so the chat shows a message
        // instead of the whole page failing.
        console.error("[agent] stream error:", error);
        const message = error instanceof Error ? error.message : "";
        if (/invalid token|unauthorized|401/i.test(message)) {
          return "AI 服务鉴权失败：API Key 无效或已过期，请更新 .env 中的 AI_API_KEY。";
        }
        if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout/i.test(message)) {
          return "无法连接 AI 服务，请检查网络或 AI_BASE_URL 配置。";
        }
        return "AI 服务暂时不可用，请稍后重试。";
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
