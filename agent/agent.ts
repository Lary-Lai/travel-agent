/**
 * The Agent runtime.
 *
 *   user -> LLM -> tool call -> tool -> service -> PostgreSQL -> tool result
 *        -> LLM -> streamed answer -> UI
 *
 * `stopWhen(stepCountIs(n))` is what makes this a real multi-step agent loop:
 * the model may search, then read details, then compare, then write to a
 * wishlist before producing its final answer — all in one turn.
 */
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { buildSystemPrompt } from "./prompts/system";
import { createChatModel } from "./provider";
import { getSession } from "./session";
import { createAgentTools } from "./tools";

/** Maximum tool-calling rounds per user turn. */
const MAX_STEPS = 8;

export type RunAgentInput = {
  messages: UIMessage[];
  userId: string | null;
  sessionId: string;
};

export async function runAgent({ messages, userId, sessionId }: RunAgentInput) {
  const session = getSession(sessionId);
  const tools = createAgentTools({ userId, session }, sessionId);

  return streamText({
    model: createChatModel(),
    system: buildSystemPrompt({ isAuthenticated: Boolean(userId) }),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    // Low temperature: tool arguments benefit from being predictable.
    temperature: 0.3,
  });
}
