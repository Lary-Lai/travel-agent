"use client";

import { ArrowUpRight, Star } from "lucide-react";
import Link from "next/link";

import { FavoriteButton } from "@/components/favorite-button";
import { useLocale } from "@/components/locale-provider";
import { SafeImage } from "@/components/safe-image";
import { formatPrice, formatRating } from "@/lib/format";
import { localizedTitle } from "@/lib/i18n/listing-text";
import { cityName } from "@/lib/i18n/cities";

/** Loose shape: tool outputs vary slightly between tools. */
export type AgentListing = {
  id: string;
  title: string;
  city?: string;
  cityLabel?: string;
  location?: string;
  pricePerNight?: number;
  rating?: number;
  reviewCount?: number;
  maxGuests?: number;
  bedrooms?: number;
  propertyTypeLabel?: string;
  image?: string;
  nearSubway?: boolean;
  reason?: string;
  rank?: number;
};

/**
 * Compact listing card for Agent results.
 * Supports the two actions the brief requires: view detail and save.
 */
export function AgentListingCard({ listing }: { listing: AgentListing }) {
  const { locale, t } = useLocale();
  const city = listing.city ? cityName(locale, listing.city) : (listing.cityLabel ?? "");
  const image = listing.image;

  return (
    <article className="bg-background hover:border-primary/40 group relative flex gap-3 rounded-xl border p-2.5 transition-colors">
      <Link
        href={`/listings/${listing.id}`}
        className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted"
      >
        <SafeImage
          src={image ?? ""}
          alt={localizedTitle(locale, listing)}
          sizes="80px"
          className="transition-transform duration-300 group-hover:scale-105"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/listings/${listing.id}`} className="block">
          <div className="flex items-start gap-2">
            {listing.rank ? (
              <span className="bg-primary text-primary-foreground mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                {listing.rank}
              </span>
            ) : null}
            <h4 className="line-clamp-1 text-xs font-semibold">
            {localizedTitle(locale, listing)}
          </h4>
          </div>

          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px]">
            {[city, listing.location].filter(Boolean).join(" · ")}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
            {listing.pricePerNight ? (
              <span className="font-semibold">
                {formatPrice(listing.pricePerNight)} {t("common.perNight")}
              </span>
            ) : null}
            {listing.rating ? (
              <span className="flex items-center gap-0.5">
                <Star className="size-3 fill-current" />
                {formatRating(listing.rating)}
              </span>
            ) : null}
            {listing.maxGuests ? (
              <span>{t("listing.maxGuests", { count: listing.maxGuests })}</span>
            ) : null}
            {listing.nearSubway ? (
              <span className="text-primary">{t("amenities.nearSubway")}</span>
            ) : null}
          </div>

          {listing.reason ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px] italic">
              {t("agentUi.recommendReason", { reason: listing.reason })}
            </p>
          ) : null}
        </Link>

        <div className="mt-1.5 flex items-center gap-2">
          <Link
            href={`/listings/${listing.id}`}
            className="text-primary inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
          >
            {t("agentUi.viewDetail")}
            <ArrowUpRight className="size-3" />
          </Link>
          <span className="text-muted-foreground text-[11px]">·</span>
          <FavoriteButton
            listingId={listing.id}
            listingTitle={localizedTitle(locale, listing)}
            variant="plain"
            className="hover:text-primary p-0 text-[11px]"
          />
        </div>
      </div>
    </article>
  );
}
