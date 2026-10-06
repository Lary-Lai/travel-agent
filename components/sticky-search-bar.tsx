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
/**
 * Gap between the two thresholds, in pixels.
 *
 * Collapsing and expanding use *different* boundaries on purpose: enter compact
 * when the hero bar's bottom edge passes the header, and only return to expanded
 * once it has come back 24px further. A single boundary makes the state flicker
 * when a trackpad or momentum scroll parks exactly on it — this is the `delta`
 * in the classic scroll-direction snippet, expressed as geometry rather than as
 * a scroll delta, because geometry is what actually decides which bar is right.
 */
const HYSTERESIS = 24;
/** Narrowest the compact bar gets. */
const COMPACT_WIDTH = 576;
/** Corner radii for the two ends of the transition (the hero bar is `rounded-3xl`). */
const WIDE_RADIUS = 26;
const NARROW_RADIUS = 16;
/** Duration of every transition below, so the pieces stay in step. */
const DURATION = "duration-300";

/** Two states, and the animation is the transition between them. */
type Phase = "expanded" | "compact";

/**
 * The hero search bar, plus the compact bar that takes over once it scrolls away.
 *
 * ## How the state machine works
 *
 * There are exactly two phases and a rule for crossing between them:
 *
 *  - **compact** once the hero bar's bottom edge passes under the header;
 *  - **expanded** again once it has come back out, plus the hysteresis band;
 *  - and **always expanded at `scrollY === 0`**, which is the guarantee a user
 *    actually relies on: scrolling all the way back to the top restores the full
 *    search bar.
 *
 * The phase is *latched*: scrolling further down while already compact changes
 * nothing, and scrolling up mid-page does not expand either — only crossing a
 * threshold does. That is what keeps the 300ms transition from being retriggered
 * on every scroll event, and it is why the animation can be a plain CSS
 * transition instead of a value recomputed on every frame.
 *
 * ## Why the threshold is the hero bar's edge, not a fixed pixel offset
 *
 * A fixed offset (100px, say) and a literal "expand at scrollTop === 0" both
 * produce the same visible bug on this page: **two search bars at once.** The
 * hero is a tall card, so at 100px of scroll the hero bar is still fully on
 * screen, and on the way back up it stays on screen until the page is nearly at
 * the top. Handing over on the bar's own geometry is the only threshold that is
 * correct for the actual layout — an earlier version used a sentinel above the
 * bar and did show both bars simultaneously.
 *
 * ## One draft, two instances
 *
 * Both bars are bound to the same `draft` (`value`/`onChange`), and the hero bar
 * is hidden by scrolling rather than unmounted, so the two can never disagree.
 * Both submit through the same path: the compact bar is a real search bar, not a
 * decorative summary.
 */
export function StickySearchBar({ destinations }: Props) {
  const heroRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("expanded");
  const [heroWidth, setHeroWidth] = useState<number | null>(null);

  const [draft, setDraft] = useState<SearchDraft>({
    destination: "",
    checkIn: "",
    checkOut: "",
    guests: 2,
  });

  /** Read the hero bar's geometry and latch the phase across its thresholds. */
  const measure = useCallback(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const rect = hero.getBoundingClientRect();
    setHeroWidth(rect.width);

    const bottom = rect.bottom;
    // `scrollY <= 0` is the "back at the top" guarantee, stated explicitly rather
    // than left as a side effect of the geometry.
    const atTop = window.scrollY <= 0;

    // Functional update: the scroll handler then needs no `phase` dependency and
    // stays a stable listener for the life of the component.
    setPhase((current) => {
      if (atTop) return "expanded";
      if (current === "expanded" && bottom <= HEADER_HEIGHT) return "compact";
      if (current === "compact" && bottom >= HEADER_HEIGHT + HYSTERESIS) return "expanded";
      return current;
    });
  }, []);

  useEffect(() => {
    // One rAF-throttled read per frame: a single getBoundingClientRect, and the
    // state only changes when a threshold is crossed.
    const onScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        measure();
      });
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });

    // The hero bar's width depends on the viewport, so re-measure on resize.
    const observer = new ResizeObserver(onScroll);
    if (heroRef.current) observer.observe(heroRef.current);

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [measure]);

  const compact = phase === "compact";

  /*
   * Width is the hero bar's own measured width while expanded, so the collapse
   * animates *from the size the user was just looking at*. Because the container
   * is centred, reducing the width shortens the bar from both sides inward.
   *
   * This is a layout-affecting property, so it cannot be composited the way
   * `transform` can — `will-change: transform` would be a lie here. What keeps it
   * cheap is that it runs once per state change rather than once per frame, which
   * is exactly what the latched phase above buys. The entry/exit *slide* is a
   * transform, and that part is hinted and GPU-friendly.
   */
  const width = compact
    ? Math.min(COMPACT_WIDTH, heroWidth ?? COMPACT_WIDTH)
    : (heroWidth ?? COMPACT_WIDTH);

  return (
    <>
      <div ref={heroRef}>
        <SearchBar variant="hero" destinations={destinations} value={draft} onChange={setDraft} />
      </div>

      {/*
        Outside the hero's `overflow-hidden` wrapper, otherwise it could not stick
        past the hero's own bounds. `motion-reduce` keeps the state change instant
        for anyone who has asked for reduced motion — the bar still swaps, it just
        does not travel.
      */}
      <div
        className={cn(
          "fixed inset-x-0 top-16 z-40 flex justify-center px-4",
          "transition-[opacity,transform] ease-out motion-reduce:transition-none",
          DURATION,
          compact
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
        aria-hidden={!compact}
        // Read by the scroll-animation check, which asserts the *phase* rather
        // than inferring it from opacity: the two are not the same thing while a
        // 300ms fade is in flight.
        data-phase={phase}
        style={{ willChange: "transform, opacity" }}
      >
        <div
          className={cn(
            "transition-[width,border-radius] ease-out motion-reduce:transition-none",
            DURATION,
          )}
          style={{
            width: `${width}px`,
            maxWidth: "100%",
            // Keep the corners in step with the width, so the bar reads as one
            // object changing shape rather than two different components.
            borderRadius: `${compact ? NARROW_RADIUS : WIDE_RADIUS}px`,
          }}
        >
          <SearchBar
            variant="compact"
            destinations={destinations}
            value={draft}
            onChange={setDraft}
            style={{ borderRadius: "inherit" }}
          />
        </div>
      </div>
    </>
  );
}
