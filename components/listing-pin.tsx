"use client";

import { ExternalLink, Star } from "lucide-react";

import { useT } from "@/components/locale-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPrice } from "@/lib/format";
import { useHoverMenu } from "@/lib/use-hover-menu";
import type { MapListingDto } from "@/types";

/**
 * A listing pin on the planning map, with a card that appears when the pointer rests on
 * it.
 *
 * ## Why not the `title` attribute
 *
 * The pin used to carry `title="名称 · ¥价格"`, which renders as the browser's own
 * tooltip: unstyled, delayed by about a second, unreadable on a busy map, unable to show
 * the photo, and clipped by nothing but the platform's own timing. On a map whose whole
 * point is *which* of 18 places in a city you are looking at, that is the moment the
 * information matters most.
 *
 * ## Why a DropdownMenu and not a HoverCard
 *
 * There is no HoverCard primitive in this project, and the hover-card behaviour it needs
 * already exists: `useHoverMenu` plus a non-modal Radix menu is what the account menu and
 * the language picker use, and it was written to fix a real flicker (a modal menu sets
 * `pointer-events: none` on the page, which makes a hover trigger fire `pointerleave` and
 * reopen on a loop). Reusing it means the pin inherits that fix rather than
 * reimplementing it. The cost is that the card is announced as a menu; the pin keeps its
 * `aria-label`, so a screen reader still gets the listing name and price without hovering.
 *
 * ## Why the card must be portalled
 *
 * The map clips its contents (`overflow-hidden`) so the tile mosaic cannot spill into the
 * page. Radix portals the content to the body, which is what lets the card escape that
 * clip — an absolutely positioned div inside the map would be cut off at the edge.
 */
export function ListingPin({
  listing,
  x,
  y,
  planned,
}: {
  listing: MapListingDto;
  x: number;
  y: number;
  /** Day number when this listing is already in the itinerary. */
  planned?: number;
}) {
  const t = useT();
  const menu = useHoverMenu();
  const label = `${listing.title} · ${formatPrice(listing.pricePerNight)}`;

  return (
    <DropdownMenu modal={false} open={menu.open} onOpenChange={menu.onOpenChange}>
      <DropdownMenuTrigger asChild>
        <a
          href={`/listings/${listing.id}`}
          {...menu.triggerProps}
          data-map-pin={listing.id}
          className="bg-primary ring-background absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 transition-transform hover:scale-150"
          style={{ left: x, top: y }}
          aria-label={label}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="center"
        side="top"
        sideOffset={8}
        {...menu.contentProps}
        // `shadow-float` is this project's floating-surface shadow (coral-tinted rather
        // than black). Measured: the card sits 0.5px off centre and 10.8px above the pin,
        // so the shadow is what separates it from a light map — without one it blends
        // into pale tiles.
        className="shadow-float w-56 overflow-hidden p-0"
      >
        {/* The photo is how people recognise a listing they saw in the list. */}
        <div className="bg-muted aspect-video w-full overflow-hidden">
          {listing.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={listing.image}
              alt={listing.title}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : null}
        </div>

        <div className="space-y-1 p-3">
          {/* Two lines, not one: this card exists so the name can be read, and
              `line-clamp-1` cut 考山路静谧精品酒店 · 含早餐｜曼谷 to "…含早…" — the
              distinguishing part of the name thrown away by the thing meant to show it. */}
          <p className="line-clamp-2 text-sm font-medium">{listing.title}</p>
          <p className="text-muted-foreground line-clamp-1 text-xs">{listing.location}</p>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="flex items-center gap-1 text-xs">
              <Star className="size-3 fill-current" />
              {listing.rating.toFixed(1)}
            </span>
            <span className="text-xs font-medium tabular-nums">
              {formatPrice(listing.pricePerNight)}
              <span className="text-muted-foreground font-normal">{t("plan.perNight")}</span>
            </span>
          </div>
          {planned ? (
            <p className="text-primary pt-0.5 text-xs">
              {t("plan.inPlan")} · {t("plan.day", { day: planned })}
            </p>
          ) : null}
        </div>

        {/* The whole pin already links to the listing; this makes the destination
            explicit, because "hover shows a card" is not obviously a link. */}
        <DropdownMenuItem asChild onSelect={menu.closeNow}>
          <a
            href={`/listings/${listing.id}`}
            className="text-primary justify-center gap-1.5 border-t py-2 text-xs"
          >
            <ExternalLink className="size-3" />
            {t("plan.viewListing")}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
