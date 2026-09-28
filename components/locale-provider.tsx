"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTranslator, intlLocale, type Translate } from "@/lib/i18n";
import { LOCALE_COOKIE, LOCALE_META, type Locale } from "@/lib/i18n/locales";

type LocaleContextValue = {
  locale: Locale;
  t: Translate;
  /** Intl-ready tag (zh-TW becomes zh-Hant), for dates and numbers. */
  intl: string;
  setLocale: (next: Locale) => void;
  /** True while the server re-render for a language change is in flight. */
  isSwitching: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Holds the active locale for client components.
 *
 * Seeded from the server (which read the cookie) so the first paint is already
 * correct. On switch it does three things, and all three are needed:
 *
 *  1. updates local state, so client components re-render immediately;
 *  2. writes the cookie, so the *next* request — including the refresh below —
 *     is served in the new language;
 *  3. calls `router.refresh()`, which re-runs the Server Components.
 *
 * Step 3 is the one that is easy to miss. Most of this app's text is rendered on
 * the server (the home page, filters, listing cards), and those trees are not
 * re-rendered by a client state update — the page kept showing the previous
 * language until the user reloaded by hand.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [isSwitching, startTransition] = useTransition();

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;

      setLocaleState(next);
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
      // Keep the document language in step for screen readers and hyphenation.
      document.documentElement.lang = LOCALE_META[next].htmlLang;

      // Re-render the server tree with the new cookie. Wrapped in a transition so
      // `isSwitching` can show progress instead of the UI appearing to do nothing
      // while the server round-trip is in flight.
      startTransition(() => {
        router.refresh();
      });
    },
    [locale, router],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: createTranslator(locale), intl: intlLocale(locale), setLocale, isSwitching }),
    [locale, setLocale, isSwitching],
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
