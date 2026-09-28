/**
 * Server-side locale resolution.
 *
 * Reads the cookie so a Server Component can render the right language on the
 * very first byte (no flash of the wrong language, no client round-trip). Falls
 * back to the visitor's `Accept-Language` before defaulting, so the first visit
 * is usually already in a language they read.
 */
import { cookies, headers } from "next/headers";

import { createTranslator, type Translate } from ".";
import {
  FALLBACK_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  matchAcceptLanguage,
  type Locale,
} from "./locales";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerList = await headers();
  return matchAcceptLanguage(headerList.get("accept-language")) ?? FALLBACK_LOCALE;
}

/** Locale + bound translator in one await, for Server Components. */
export async function getTranslator(): Promise<{ locale: Locale; t: Translate }> {
  const locale = await getLocale();
  return { locale, t: createTranslator(locale) };
}
