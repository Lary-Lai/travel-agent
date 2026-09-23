"use client";

import { ArrowUpRight, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { FavoriteButton } from "@/components/favorite-button";
import { formatPrice, formatRating } from "@/lib/format";

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
  const city = listing.cityLabel ?? listing.city ?? "";
  const image = listing.image;

  return (
    <article className="bg-background hover:border-primary/40 group relative flex gap-3 rounded-xl border p-2.5 transition-colors">
      <Link
        href={`/listings/${listing.id}`}
        className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted"
      >
        {image ? (
          <Image
            src={image}
            alt={listing.title}
            fill
            sizes="80px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
      </Link>

      <div className="min-w-0 flex-1">
        <Link href={`/listings/${listing.id}`} className="block">
          <div className="flex items-start gap-2">
            {listing.rank ? (
              <span className="bg-primary text-primary-foreground mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                {listing.rank}
              </span>
            ) : null}
            <h4 className="line-clamp-1 text-xs font-semibold">{listing.title}</h4>
          </div>

          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px]">
            {[city, listing.location].filter(Boolean).join(" · ")}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
            {listing.pricePerNight ? (
              <span className="font-semibold">{formatPrice(listing.pricePerNight)}/晚</span>
            ) : null}
            {listing.rating ? (
              <span className="flex items-center gap-0.5">
                <Star className="size-3 fill-current" />
                {formatRating(listing.rating)}
              </span>
            ) : null}
            {listing.maxGuests ? <span>可住 {listing.maxGuests} 人</span> : null}
            {listing.nearSubway ? <span className="text-primary">近地铁</span> : null}
          </div>

          {listing.reason ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-[11px] italic">
              推荐理由：{listing.reason}
            </p>
          ) : null}
        </Link>

        <div className="mt-1.5 flex items-center gap-2">
          <Link
            href={`/listings/${listing.id}`}
            className="text-primary inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
          >
            查看详情
            <ArrowUpRight className="size-3" />
          </Link>
          <span className="text-muted-foreground text-[11px]">·</span>
          <FavoriteButton
            listingId={listing.id}
            listingTitle={listing.title}
            variant="plain"
            className="hover:text-primary p-0 text-[11px]"
          />
        </div>
      </div>
    </article>
  );
}
