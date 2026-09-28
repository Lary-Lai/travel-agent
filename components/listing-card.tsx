"use client";

import { MapPin, Star } from "lucide-react";
import Link from "next/link";

import { FavoriteButton } from "@/components/favorite-button";
import { useLocale } from "@/components/locale-provider";
import { localizedLocation, localizedTitle } from "@/lib/i18n/listing-text";
import { SafeImage } from "@/components/safe-image";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice, formatRating } from "@/lib/format";
import { propertyTypeLabel } from "@/lib/i18n/labels";
import { cn } from "@/lib/utils";
import type { ListingSummary } from "@/types";

const SIZES = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw";

/**
 * Presentational listing card.
 *
 * A client component because it reads the translator: the spec line
 * ("1 bedroom · 2 beds · sleeps 3") is composed from several translated units, so
 * it cannot be rendered on the server without threading a locale through every
 * caller. The card is already adjacent to client boundaries (the heart and the
 * image), so this costs little.
 */
export function ListingCard({
  listing,
  priority = false,
  className,
}: {
  listing: ListingSummary;
  priority?: boolean;
  className?: string;
}) {
  const { locale, t } = useLocale();

  return (
    <article className={cn("group relative", className)}>
      <Link href={`/listings/${listing.id}`} className="block focus:outline-none">
        <div className="bg-muted relative aspect-square overflow-hidden rounded-xl">
          <SafeImage
            src={listing.image}
            alt={localizedTitle(locale, listing)}
            sizes={SIZES}
            priority={priority}
            className="transition-transform duration-500 will-change-transform group-hover:scale-[1.06]"
          />
          <div className="absolute top-3 left-3">
            <Badge
              variant="secondary"
              className="bg-background/90 text-foreground border-0 backdrop-blur-sm"
            >
              {propertyTypeLabel(t, listing.propertyType)}
            </Badge>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-sm font-semibold tracking-tight">{localizedTitle(locale, listing)}</h3>
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
              <Star className="size-3.5 fill-current" />
              {formatRating(listing.rating)}
            </span>
          </div>

          <p className="text-muted-foreground line-clamp-1 flex items-center gap-1 text-xs">
            <MapPin className="size-3" />
            {localizedLocation(locale, listing)}
          </p>

          <p className="text-muted-foreground text-xs">
            {t("listing.bedrooms", { count: listing.bedrooms })} ·{" "}
            {t("listing.beds", { count: listing.beds })} ·{" "}
            {t("listing.maxGuests", { count: listing.maxGuests })}
          </p>

          <p className="text-muted-foreground text-xs">
            {t("common.reviews", { count: listing.reviewCount })}
          </p>

          <p className="pt-1 text-sm">
            <span className="font-semibold">{formatPrice(listing.pricePerNight)}</span>
            <span className="text-muted-foreground"> {t("common.perNight")}</span>
          </p>
        </div>
      </Link>

      {/* Sibling of the Link (not nested) so the markup stays valid. */}
      <FavoriteButton listingId={listing.id} listingTitle={localizedTitle(locale, listing)} />
    </article>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-square w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}

export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  );
}
