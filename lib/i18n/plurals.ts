/**
 * Singular overrides.
 *
 * A `{count}` placeholder cannot inflect on its own, and naively templating
 * "one" produces the classic "1 nights" / "1 noches". Rather than pull in a
 * plural-rules library, the handful of keys where the count can legitimately be
 * 1 get an explicit singular form here.
 *
 * Languages that do not mark plurality (Chinese, Japanese, Korean) simply have
 * no entry, and the base dictionary is used — which is correct there.
 */
import type { Locale } from "./locales";
import type { ModuleKey, TranslationKey } from ".";

export const PLURALS: Partial<Record<Locale, Partial<Record<TranslationKey | ModuleKey, string>>>> = {
  en: {
    "common.nights": "{count} night",
    "common.reviews": "{count} review",
    "listing.bedrooms": "{count} bedroom",
    "listing.beds": "{count} bed",
    "reviews.summaryLine": "{rating} · {count} review",
    "reviews.stored": "{count} review on this site",
    "reviews.stars": "{count} star",
    "houseRules.rulesCount": "{count} rule",
    "booking.totalNights": "{count} night",
    "searchBar.guests": "{count} guest",
    // Forum and social counters: a thread with exactly one answer must not read
    // "1 replies", which is the same class of bug as "1 nights".
    "forum.replies": "{count} reply",
    "forum.resultsCount": "{count} post",
    "forum.postsInBoard": "{count} post",
    "social.friendCount": "{count} friend",
    "social.mutualFriends": "{count} mutual friend",
  },
  es: {
    "common.nights": "{count} noche",
    "common.reviews": "{count} reseña",
    "listing.bedrooms": "{count} habitación",
    "listing.beds": "{count} cama",
    "reviews.summaryLine": "{rating} · {count} reseña",
    "reviews.stored": "{count} reseña en este sitio",
    "reviews.stars": "{count} estrella",
    "houseRules.rulesCount": "{count} norma",
    "booking.totalNights": "{count} noche",
    "searchBar.guests": "{count} huésped",
    "forum.replies": "{count} respuesta",
    "forum.resultsCount": "{count} publicación",
    "forum.postsInBoard": "{count} publicación",
    "social.friendCount": "{count} amigo",
    "social.mutualFriends": "{count} amigo en común",
  },
};

/**
 * The singular form for this key, when the language has one and `count` is 1.
 * Returns undefined when the base dictionary should be used as-is.
 */
export function singularForm(
  locale: Locale,
  key: TranslationKey,
  count: number | undefined,
): string | undefined {
  if (count !== 1) return undefined;
  return PLURALS[locale]?.[key as ModuleKey];
}
