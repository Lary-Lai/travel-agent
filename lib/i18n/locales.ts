/**
 * Supported locales.
 *
 * Codes are BCP 47. `htmlLang` is what goes on `<html lang>` (used by screen
 * readers, hyphenation and font fallback), `nativeLabel` is how the language
 * names *itself* in the switcher — a language list that only reads
 * "Chinese/English/Japanese" is unusable to someone who cannot read English.
 */
export const LOCALES = ["zh-CN", "zh-TW", "en", "ja", "ko", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export type LocaleMeta = {
  code: Locale;
  /** Name in the language itself. */
  nativeLabel: string;
  /** Name in Simplified Chinese, for the compact trigger label. */
  labelZh: string;
  /** BCP 47 tag for `<html lang>`. */
  htmlLang: string;
  /** Flag emoji is deliberately avoided: a flag is a country, not a language. */
  short: string;
};

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  "zh-CN": { code: "zh-CN", nativeLabel: "简体中文", labelZh: "简体中文", htmlLang: "zh-CN", short: "简" },
  "zh-TW": { code: "zh-TW", nativeLabel: "繁體中文", labelZh: "繁体中文", htmlLang: "zh-Hant", short: "繁" },
  en: { code: "en", nativeLabel: "English", labelZh: "英语", htmlLang: "en", short: "EN" },
  ja: { code: "ja", nativeLabel: "日本語", labelZh: "日语", htmlLang: "ja", short: "日" },
  ko: { code: "ko", nativeLabel: "한국어", labelZh: "韩语", htmlLang: "ko", short: "한" },
  es: { code: "es", nativeLabel: "Español", labelZh: "西班牙语", htmlLang: "es", short: "ES" },
};

/** The locale every dictionary is required to cover in full. */
export const FALLBACK_LOCALE: Locale = "zh-CN";

export const LOCALE_COOKIE = "ta_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best-effort match for an `Accept-Language` header, used on a visitor's very
 * first request so the page is not in the wrong language before they pick one.
 */
export function matchAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    // Traditional Chinese must be tested before the generic "zh".
    if (tag.startsWith("zh")) {
      if (/hant|tw|hk|mo/.test(tag)) return "zh-TW";
      return "zh-CN";
    }
    if (tag.startsWith("en")) return "en";
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("ko")) return "ko";
    if (tag.startsWith("es")) return "es";
  }

  return undefined;
}
