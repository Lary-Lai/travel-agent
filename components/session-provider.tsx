"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext } from "react";

import { api } from "@/lib/api";
import type { SessionUserDto } from "@/types";

export const SESSION_QUERY_KEY = ["session"] as const;

type SessionContextValue = {
  user: SessionUserDto | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Re-read the session from the server (after login/register/logout). */
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  refresh: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: api.getSession,
    staleTime: 60_000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  }, [queryClient]);

  return (
    <SessionContext.Provider
      value={{
        user: data?.user ?? null,
        isLoading,
        isAuthenticated: Boolean(data?.user),
        refresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
