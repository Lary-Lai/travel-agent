"use client";

import { useQuery } from "@tanstack/react-query";
import { Compass, History, Sparkles } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

/**
 * Destination suggestions, personalised from the user's own search history.
 *
 * The server decides which cities to send: history-ranked for a signed-in user
 * with recorded searches, popular otherwise. That keeps this component free of
 * branching — it renders whatever comes back and only changes the heading, so
 * signed-out visitors see a sensible row instead of an empty section.
 */
export function PersonalizedDestinations() {
  const { data, isLoading } = useQuery({
    queryKey: ["personalized-destinations"],
    queryFn: api.getPersonalizedDestinations,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  const destinations = data?.destinations ?? [];
  if (destinations.length === 0) return null;

  const fromHistory = data?.source === "history";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            {fromHistory ? (
              <History className="text-primary size-5" />
            ) : (
              <Compass className="text-primary size-5" />
            )}
            {fromHistory ? "根据你的搜索记录推荐" : "为你推荐的目的地"}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {fromHistory
              ? `你已经搜索过 ${data?.totalSearches} 次，这些是你最常关注的城市`
              : "登录并搜索几次后，这里会变成只属于你的推荐"}
          </p>
        </div>
        {fromHistory ? (
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3" />
            个性化
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {destinations.map((destination) => (
          <Link
            key={destination.city}
            href={`/search?location=${encodeURIComponent(destination.city)}`}
            className="surface-sheen edge-light hover:border-primary/40 group flex flex-col justify-between rounded-2xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-sm font-semibold">{destination.cityLabel}</span>
            <span className="text-muted-foreground mt-1 text-[11px] leading-snug">
              {destination.reason}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
