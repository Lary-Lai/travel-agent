/**
 * Translation runtime.
 *
 * A tiny typed lookup rather than a library: the app owns one dictionary shape,
 * so `Dictionary` gives compile-time coverage (a locale missing a key fails the
 * build) and interpolation is a two-line regex. `next-intl` would add a
 * dependency, a build plugin and route plumbing for behaviour we do not use —
 * there is no plural-rule or date-format requirement beyond what
 * `Intl.DateTimeFormat` already does.
 *
 * Locale lives in a cookie rather than the URL. That keeps every existing route,
 * link and share URL unchanged; the trade-off is that a page cannot be shared
 * with its language pinned, which does not matter for this app.
 */
import { FALLBACK_LOCALE, type Locale } from "./locales";
import { singularForm } from "./plurals";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { ja } from "./dictionaries/ja";
import { ko } from "./dictionaries/ko";
import { zhCN, type Dictionary } from "./dictionaries/zh-CN";
import { zhTW } from "./dictionaries/zh-TW";

export type { Dictionary } from "./dictionaries/zh-CN";

import { MESSAGE_MODULES, moduleValue, type ModuleKey, type ModuleName } from "./messages";

/** Group namespaces are routed to their own modules; everything else is a dot-path. */
const MODULE_NAMES = new Set<string>(Object.keys(MESSAGE_MODULES));

export type TranslationKey = MainKey | ModuleKey;

export const DICTIONARIES: Record<Locale, Dictionary> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW as Dictionary,
  en: en as Dictionary,
  ja: ja as Dictionary,
  ko: ko as Dictionary,
  es: es as Dictionary,
};

/** Dot-paths into the dictionary, e.g. `"home.destinations"`. */
type Leaf<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaf<T[K]>}`;
}[keyof T & string];

export type MainKey = Leaf<Dictionary>;

export type TVars = Record<string, string | number>;

/**
 * Resolve a dot-path, falling back to the reference locale and finally to the
 * key itself. Returning the key (rather than an empty string) makes a missing
 * translation visible in the UI instead of silently rendering nothing.
 */
function lookup(dictionary: Dictionary, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      dictionary,
    );

  return typeof value === "string" ? value : undefined;
}

/** Replace `{name}` placeholders. Unknown placeholders are left untouched. */
export function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export function translate(locale: Locale, key: TranslationKey, vars?: TVars): string {
  const namespace = key.split(".")[0];

  // A group module owns its whole namespace, so route there first — but fall
  // THROUGH rather than returning the key if the module does not define it.
  // A module can legitimately own a namespace while the main dictionary still
  // holds keys in it (e.g. `wishlist.*` exists in both); without this fallback
  // such a key renders as its own name instead of its translation.
  if (MODULE_NAMES.has(namespace)) {
    const fromModule =
      moduleValue(namespace as ModuleName, locale, key) ??
      moduleValue(namespace as ModuleName, FALLBACK_LOCALE, key);
    if (fromModule !== undefined) return interpolate(fromModule, vars);
  }

  // A count of exactly 1 may need a singular form ("1 night", not "1 nights").
  const singular = singularForm(locale, key as MainKey, typeof vars?.count === "number" ? vars.count : undefined);
  const fromLocale = singular ?? lookup(DICTIONARIES[locale], key);
  const fromFallback = lookup(DICTIONARIES[FALLBACK_LOCALE], key);
  return interpolate(fromLocale ?? fromFallback ?? key, vars);
}

export type Translate = (key: TranslationKey, vars?: TVars) => string;

/** Bind a locale once so components call `t("home.destinations")`. */
export function createTranslator(locale: Locale): Translate {
  return (key, vars) => translate(locale, key, vars);
}

/**
 * A locale that formats correctly for dates and numbers.
 * `zh-TW` maps to `zh-Hant` so month names render in Traditional Chinese.
 */
export function intlLocale(locale: Locale): string {
  return locale === "zh-TW" ? "zh-Hant" : locale;
}
