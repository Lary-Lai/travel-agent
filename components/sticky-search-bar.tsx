"use client";

import { useEffect, useRef, useState } from "react";

import { SearchBar, type SearchBarDestination } from "@/components/search-bar";
import { cn } from "@/lib/utils";
import type { SearchDraft } from "@/lib/store";

type Props = {
  destinations: SearchBarDestination[];
};

/**
 * The hero search bar, plus the compact copy that takes over once it scrolls
 * away.
 *
 * One draft drives both instances (`value`/`onChange` on SearchBar): the hero bar
 * is only hidden by scrolling, not unmounted, so its field state survives, and
 * the compact bar can never disagree with it. Editing in either place updates
 * the other, and both submit through the same code path — so the compact bar is
 * a real search bar, not a decorative summary.
 *
 * Detection uses an IntersectionObserver on a sentinel placed just above the bar
 * rather than a scroll listener: no per-frame work, and it stays correct when the
 * header height or the hero's own size changes.
 */
export function StickySearchBar({ destinations }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [draft, setDraft] = useState<SearchDraft>({
    destination: "",
    checkIn: "",
    checkOut: "",
    guests: 2,
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      // Once the sentinel has passed the sticky header, switch to the compact bar.
      { rootMargin: "-64px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <SearchBar variant="hero" destinations={destinations} value={draft} onChange={setDraft} />

      {/*
        The sentinel sits BELOW the bar, not above it.
        Placed above, it leaves the root the moment the bar's top passes the
        header — at which point most of the hero bar is still on screen, so the
        compact bar appeared on top of it and the page showed two search bars at
        once. Below, it leaves the root exactly when the hero bar's *bottom* has
        scrolled under the header, i.e. when the hero bar is fully invisible.
      */}
      <div ref={sentinelRef} aria-hidden className="h-px w-full" />

      {/* The compact bar lives outside the hero's `overflow-hidden` wrapper,
          otherwise it could not stick past the hero's own bounds. */}
      <div
        className={cn(
          "fixed inset-x-0 top-16 z-40 flex justify-center px-4 transition-all duration-300 ease-out",
          pinned
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-3 opacity-0",
        )}
        aria-hidden={!pinned}
      >
        <div
          className={cn(
            "w-full max-w-2xl origin-top transition-transform duration-300 ease-out",
            pinned ? "scale-100" : "scale-95",
          )}
        >
          <SearchBar
            variant="compact"
            destinations={destinations}
            value={draft}
            onChange={setDraft}
            // The compact bar sits on a translucent backdrop; `hidden` also keeps
            // it out of the tab order while it is invisible.
            className={cn(!pinned && "invisible")}
          />
        </div>
      </div>
    </>
  );
}
