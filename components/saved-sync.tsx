"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api";
import { useSavedStore } from "@/lib/store";

/**
 * Keeps the Zustand "saved" set in sync with the server.
 * Runs once per browser session (and after login/logout) so heart icons render
 * in the correct state without each card fetching on its own.
 */
export function SavedSync() {
  const { user, isLoading } = useSession();
  const setSaved = useSavedStore((state) => state.setSaved);
  const reset = useSavedStore((state) => state.reset);

  const { data } = useQuery({
    queryKey: ["saved"],
    queryFn: () => api.getSaved(),
    enabled: !isLoading && Boolean(user),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data?.listingIds) setSaved(data.listingIds);
  }, [data, setSaved]);

  useEffect(() => {
    if (!isLoading && !user) reset();
  }, [isLoading, user, reset]);

  return null;
}
