"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { AgentChat } from "@/components/agent-chat";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAgentStore } from "@/lib/store";

/**
 * Agent surface: a floating action button plus a right-hand drawer.
 *
 * Conversation state lives in <AgentProvider> (above this component), so closing
 * and reopening the drawer does not reset the chat.
 */
export function AgentDrawer() {
  const open = useAgentStore((state) => state.open);
  const setOpen = useAgentStore((state) => state.setOpen);

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
          aria-describedby={undefined}
          // The built-in close button is absolutely positioned at top-3 right-3,
          // which collided with the chat header's 清空 button. The header renders
          // its own close button instead, so both sit in one aligned row.
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">AI 旅行助手</SheetTitle>
          <AgentChat />
        </SheetContent>
      </Sheet>

      {!open ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, scale: 0.85, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          onClick={() => setOpen(true)}
          aria-label="打开 AI 旅行助手"
          className="bg-primary text-primary-foreground hover:bg-primary/90 fixed right-5 bottom-5 z-50 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg shadow-black/20 transition-colors sm:right-6 sm:bottom-6"
        >
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">AI 助手</span>
        </motion.button>
      ) : null}
    </>
  );
}
