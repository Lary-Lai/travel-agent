"use client";

import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

import { useAgentStore } from "@/lib/store";

type AgentStatus = { configured: boolean; model: string; problem: string | null };

type AgentContextValue = {
  messages: UIMessage[];
  status: string;
  busy: boolean;
  error: Error | undefined;
  send: (text: string) => void;
  stop: () => void;
  clear: () => void;
  retryLast: () => void;
  agentStatus: AgentStatus | undefined;
  notConfigured: boolean;
};

const AgentContext = createContext<AgentContextValue | null>(null);

/**
 * Owns the chat session.
 *
 * Living above the drawer is deliberate: the Radix Sheet unmounts its content
 * when closed, so conversation state kept inside it would be lost every time
 * the user closes the panel to browse the wishlist and reopens it.
 */
export function AgentProvider({ children }: { children: React.ReactNode }) {
  // Conversation id lives in the store, created lazily on first send: it must
  // not be generated during render (Date.now/Math.random are impure), and useId()
  // would be wrong because it derives from tree position, which would make two
  // different visitors collide in the server's per-conversation memory.
  const consumePrompt = useAgentStore((state) => state.consumePrompt);
  const open = useAgentStore((state) => state.open);
  const autoSentRef = useRef(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        // Resolved per request, outside render, once the id is needed.
        body: () => ({ sessionId: useAgentStore.getState().ensureSessionId() }),
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({ transport });

  const busy = status === "submitted" || status === "streaming";

  const { data: agentStatus } = useQuery({
    queryKey: ["agent-status"],
    queryFn: async (): Promise<AgentStatus> => {
      const response = await fetch("/api/agent");
      const payload = (await response.json()) as { data?: AgentStatus };
      return payload.data ?? { configured: false, model: "", problem: "无法获取 AI 状态" };
    },
    staleTime: 60_000,
  });

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      void sendMessage({ text: trimmed });
    },
    [busy, sendMessage],
  );

  // A CTA elsewhere in the app can queue a prompt; send it once the panel opens.
  useEffect(() => {
    if (!open || autoSentRef.current || busy) return;
    const pending = consumePrompt();
    if (!pending) return;
    autoSentRef.current = true;
    send(pending);
  }, [open, busy, consumePrompt, send]);

  const clear = useCallback(() => setMessages([]), [setMessages]);

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const text = lastUser?.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
    if (text) send(text);
  }, [messages, send]);

  const value: AgentContextValue = {
    messages,
    status,
    busy,
    error: error ?? undefined,
    send,
    stop,
    clear,
    retryLast,
    agentStatus,
    notConfigured: agentStatus?.configured === false,
  };

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) throw new Error("useAgent must be used inside <AgentProvider>");
  return context;
}
