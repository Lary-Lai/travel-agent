"use client";

import { useEffect, useRef } from "react";

import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api";

/**
 * Records the search currently on screen, so recommendations can follow what the
 * user actually looks for.
 *
 * Runs as an explicit POST rather than writing during the search page's render:
 * a GET that mutates the database is a smell, and it would also fire on
 * prefetches. Signed-out visitors are skipped here *and* ignored by the endpoint,
 * so no query text is ever stored without an account behind it.
 *
 * Deduplicated on the query signature so paginating, re-sorting or a re-render
 * does not inflate the signal — the server also collapses repeats within an hour.
 */
export function SearchRecorder({
  location,
  guests,
  priceMin,
  priceMax,
  propertyType,
}: {
  location?: string;
  guests?: number;
  priceMin?: number;
  priceMax?: number;
  propertyType?: string;
}) {
  const { user, isLoading } = useSession();
  const lastSent = useRef<string | null>(null);

  const signature = JSON.stringify([location ?? "", guests ?? null, priceMin ?? null, priceMax ?? null, propertyType ?? ""]);

  useEffect(() => {
    if (isLoading || !user) return;
    // Only a search with a destination carries signal about where to go.
    if (!location || location.trim().length === 0) return;
    if (lastSent.current === signature) return;

    lastSent.current = signature;

    // Fire and forget: personalisation must never break the page it runs on.
    api
      .recordSearch({
        location,
        guests,
        priceMin,
        priceMax,
        propertyType,
      })
      .catch(() => {
        // Allow a later attempt if the network hiccuped.
        lastSent.current = null;
      });
  }, [isLoading, user, location, guests, priceMin, priceMax, propertyType, signature]);

  return null;
}
