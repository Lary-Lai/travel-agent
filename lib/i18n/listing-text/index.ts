/**
 * Localised building blocks for listing titles and addresses.
 *
 * Titles are *generated* from templates rather than authored per listing, so
 * localising them means translating the parts (neighbourhood names, adjectives,
 * the title shapes) and composing per locale — not storing 180 hand-written
 * translations. The seed uses this to fill `Listing.titleI18n` /
 * `Listing.locationI18n`; the API and the Agent keep reading the Chinese
 * `title` / `location`, which stay the authored values.
 */
import { cityName } from "../cities";
import type { Locale } from "../locales";
import { listingText as en } from "./en";
import { listingText as es } from "./es";
import { listingText as ja } from "./ja";
import { listingText as ko } from "./ko";
import { listingText as zhTW } from "./zh-TW";

export type ListingText = {
  neighborhoods: Record<string, string>;
  adjectives: Record<string, string>;
  templates: Record<string, readonly string[]>;
};

/** Locales that need generated text. zh-CN keeps the seed's authored Chinese. */
export const LISTING_TEXT: Partial<Record<Locale, ListingText>> = {
  "zh-TW": zhTW as unknown as ListingText,
  en: en as unknown as ListingText,
  ja: ja as unknown as ListingText,
  ko: ko as unknown as ListingText,
  es: es as unknown as ListingText,
};

export const GENERATED_LOCALES = ["zh-TW", "en", "ja", "ko", "es"] as const;

/** Fill a template's placeholders. Unknown placeholders are left visible. */
export function fillTemplate(
  template: string,
  values: { neighborhood: string; adjective: string; walk: number; guests: number },
): string {
  return template
    .replace(/\{neighborhood\}/g, values.neighborhood)
    .replace(/\{adjective\}/g, values.adjective)
    .replace(/\{walk\}/g, String(values.walk))
    .replace(/\{guests\}/g, String(values.guests));
}

/**
 * Build the per-locale title + address for one listing.
 *
 * `variant` is the listing's index, used to pick a template so two listings of
 * the same type and neighbourhood do not read identically.
 */
export function buildLocalizedListingText(input: {
  /** Chinese neighbourhood name, as stored. */
  neighborhood: string;
  /** English city name, as stored. */
  city: string;
  /** Chinese city label, used for the zh-CN fallback. */
  cityZh: string;
  propertyType: string;
  adjective: string;
  walk: number;
  guests: number;
  variant: number;
}): { titleI18n: Record<string, string>; locationI18n: Record<string, string> } {
  const titleI18n: Record<string, string> = { "zh-CN": "" };
  const locationI18n: Record<string, string> = {
    "zh-CN": `${input.neighborhood}, ${input.cityZh}`,
  };

  for (const locale of GENERATED_LOCALES) {
    const text = LISTING_TEXT[locale];
    if (!text) continue;

    const neighborhood = text.neighborhoods[input.neighborhood] ?? input.neighborhood;
    const adjective = text.adjectives[input.adjective] ?? input.adjective;
    const city = cityName(locale, input.city);

    locationI18n[locale] = `${neighborhood}, ${city}`;

    const candidates = text.templates[input.propertyType] ?? [];
    const template = candidates[input.variant % Math.max(1, candidates.length)] ?? "{neighborhood}";
    titleI18n[locale] =
      fillTemplate(template, {
        neighborhood,
        adjective,
        walk: input.walk,
        guests: input.guests,
      }) + `｜${city}`;
  }

  return { titleI18n, locationI18n };
}

/**
 * The listing's title / address in the reader's language.
 *
 * Falls back to the authored Chinese values, so a listing seeded before this
 * feature (or created outside the seed) still renders rather than showing blank.
 */
export function localizedTitle(
  locale: Locale,
  listing: { title: string; titleI18n?: Record<string, string> | null },
): string {
  return listing.titleI18n?.[locale] ?? listing.title;
}

export function localizedLocation(
  locale: Locale,
  listing: { location: string; locationI18n?: Record<string, string> | null },
): string {
  return listing.locationI18n?.[locale] ?? listing.location;
}
