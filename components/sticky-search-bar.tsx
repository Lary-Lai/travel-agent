"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SearchBar, type SearchBarDestination } from "@/components/search-bar";
import { cn } from "@/lib/utils";
import type { SearchDraft } from "@/lib/store";

type Props = {
  destinations: SearchBarDestination[];
};

/** Height of the sticky site header; the compact bar parks directly beneath it. */
const HEADER_HEIGHT = 64;
/** Scrolling distance over which the bar shrinks from full to compact width. */
const SHRINK_RANGE = 160;
/** Narrowest the compact bar gets. */
const COMPACT_WIDTH = 576;
/** Matches `rounded-3xl` on the hero bar, easing to `rounded-2xl` when compact. */
const WIDE_RADIUS = 24;
const NARROW_RADIUS = 16;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * The hero search bar, plus the compact bar that takes over once it scrolls away.
 *
 * The compact bar does not pop in at a fixed width. It **starts at the hero bar's
 * own measured width and narrows toward the centre** as the page keeps scrolling,
 * which is what makes the transition read as *the* search bar shrinking rather
 * than a second bar appearing. Because the container is centred, reducing the
 * width shortens it from both sides inward.
 *
 * Progress comes from the hero bar's own bounding rect rather than a separate
 * sentinel, so it pins exactly when its bottom edge passes the header and the
 * shrink starts from that precise moment. (An earlier version observed a sentinel
 * placed *above* the bar, which switched while most of the hero bar was still on
 * screen and showed two search bars at once.)
 *
 * One draft drives both instances (`value`/`onChange` on SearchBar): the hero bar
 * is hidden by scrolling, not unmounted, so its field state survives and the two
 * can never disagree. Both submit through the same path, so the compact bar is a
 * real search bar, not a decorative summary.
 */
export function StickySearchBar({ destinations }: Props) {
  const heroRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  const [pinned, setPinned] = useState(false);
  const [progress, setProgress] = useState(0);
  const [heroWidth, setHeroWidth] = useState<number | null>(null);

  const [draft, setDraft] = useState<SearchDraft>({
    destination: "",
    checkIn: "",
    checkOut: "",
    guests: 2,
  });

  /** Turn the hero bar's geometry into a pinned flag plus a 0..1 shrink progress. */
  const measure = useCallback(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const rect = hero.getBoundingClientRect();
    setHeroWidth(rect.width);

    // How far the hero bar's bottom edge has travelled past the header.
    const travelled = HEADER_HEIGHT - rect.bottom;
    setPinned(travelled > 0);
    setProgress(clamp01(travelled / SHRINK_RANGE));
  }, []);

  useEffect(() => {
    // One rAF-throttled read per frame: a single getBoundingClientRect, and the
    // two numbers only change while actually scrolling.
    const onScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measure();
      });
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    // The hero bar's width depends on the viewport, so re-measure on resize.
    const observer = new ResizeObserver(measure);
    if (heroRef.current) observer.observe(heroRef.current);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [measure]);

  // Shrink toward the centre: full hero width at progress 0, compact at 1.
  const wide = heroWidth ?? COMPACT_WIDTH;
  const target = Math.min(COMPACT_WIDTH, wide);
  const width = wide - (wide - target) * progress;
  const radius = WIDE_RADIUS - (WIDE_RADIUS - NARROW_RADIUS) * progress;

  return (
    <>
      <div ref={heroRef}>
        <SearchBar variant="hero" destinations={destinations} value={draft} onChange={setDraft} />
      </div>

      {/*
        Outside the hero's `overflow-hidden` wrapper, otherwise it could not stick
        past the hero's own bounds.
      */}
      <div
        className={cn(
          "fixed inset-x-0 top-16 z-40 flex justify-center px-4",
          // Deliberately no CSS transition on width/opacity: the scroll handler
          // already supplies a per-frame value, and transitioning on top of that
          // would lag behind the scroll.
          pinned ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!pinned}
        style={{ opacity: pinned ? Math.max(0.001, progress) : 0 }}
      >
        <div style={{ width: `${width}px`, maxWidth: "100%" }}>
          <SearchBar
            variant="compact"
            destinations={destinations}
            value={draft}
            onChange={setDraft}
            className={cn(!pinned && "invisible")}
            // Keep the corners in step with the width, so the bar reads as one
            // object changing shape rather than two different components.
            style={{ borderRadius: `${radius}px` }}
          />
        </div>
      </div>
    </>
  );
}
