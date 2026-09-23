/** Shared Agent types. */
import type { ListingSummary } from "../types";

/**
 * Compact listing shape returned to the model.
 * Deliberately small: the LLM only needs enough to reason and to quote facts,
 * while the UI renders the full card from the same ids.
 */
export type ToolListing = {
  id: string;
  title: string;
  city: string;
  cityLabel: string;
  location: string;
  pricePerNight: number;
  propertyType: string;
  propertyTypeLabel: string;
  rating: number;
  reviewCount: number;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  amenities: string[];
  nearSubway: boolean;
  image: string;
  url: string;
};

export function toToolListing(listing: ListingSummary): ToolListing {
  return {
    id: listing.id,
    title: listing.title,
    city: listing.city,
    cityLabel: listing.cityLabel,
    location: listing.location,
    pricePerNight: listing.pricePerNight,
    propertyType: listing.propertyType,
    propertyTypeLabel: listing.propertyTypeLabel,
    rating: listing.rating,
    reviewCount: listing.reviewCount,
    maxGuests: listing.maxGuests,
    bedrooms: listing.bedrooms,
    beds: listing.beds,
    bathrooms: listing.bathrooms,
    amenities: listing.amenityNames,
    nearSubway: listing.amenityNames.includes("地铁附近"),
    image: listing.image,
    url: `/listings/${listing.id}`,
  };
}

/**
 * Short-term conversation memory.
 *
 * Lets follow-up turns resolve references like "the first one you recommended".
 * Kept server-side, keyed by a client-generated conversation id.
 */
export type AgentSessionState = {
  /** Listing ids from the most recent search/recommend, in presented order. */
  lastListingIds: string[];
  /** The criteria behind those results, echoed back for context. */
  lastQuerySummary: string | null;
  updatedAt: number;
};

export type AgentContext = {
  /** Null when the visitor is not signed in (wishlist tools then fail clearly). */
  userId: string | null;
  session: AgentSessionState;
};
