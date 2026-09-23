"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AgentDrawer } from "./agent-drawer";
import { AgentProvider } from "./agent-provider";
import { SavedSync } from "./saved-sync";
import { SessionProvider } from "./session-provider";
import { ThemeProvider } from "./theme-provider";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Listings change rarely; avoid refetching on every focus.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

/**
 * One QueryClient for the browser session.
 * A fresh client is created during SSR so requests from different users can
 * never share a cache; the browser reuses a single instance via `useState`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          {/* AgentProvider sits above the drawer so chat history survives closing it. */}
          <AgentProvider>
            <TooltipProvider delayDuration={200}>
              <SavedSync />
              {children}
              <AgentDrawer />
              <Toaster position="top-center" richColors closeButton />
            </TooltipProvider>
          </AgentProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
