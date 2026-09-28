"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { createTranslator, intlLocale, type Translate } from "@/lib/i18n";
import { LOCALE_COOKIE, LOCALE_META, type Locale } from "@/lib/i18n/locales";

type LocaleContextValue = {
  locale: Locale;
  t: Translate;
  /** Intl-ready tag (zh-TW becomes zh-Hant), for dates and numbers. */
  intl: string;
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Holds the active locale for client components.
 *
 * Seeded from the server (which read the cookie) so the first paint is already
 * correct, then updated in place on switch: the cookie is written for the next
 * request and the local state re-renders immediately, so switching feels instant
 * instead of waiting for a server round-trip.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // One year, path-wide so every route sees it.
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    // Keep the document language in step for screen readers and hyphenation.
    document.documentElement.lang = LOCALE_META[next].htmlLang;
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: createTranslator(locale), intl: intlLocale(locale), setLocale }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Read the translator. Throws outside the provider rather than silently falling
 * back to Chinese, so a component mounted outside the tree is caught in
 * development instead of shipping a half-translated page.
 */
export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return context;
}

/** Shorthand when only the translator is needed. */
export function useT(): Translate {
  return useLocale().t;
}
