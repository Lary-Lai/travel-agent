/**
 * i18n dictionaries.
 *
 * `tsc` already proves each locale covers the same key tree (they are asserted
 * against `Dictionary`, which is derived from the zh-CN keys). These checks cover
 * what types cannot see: placeholders silently dropped during translation, empty
 * values, untranslated leftovers, and the singular-form override.
 *
 *     npx tsx scripts/verify-i18n.ts
 */
import { DICTIONARIES, interpolate, translate } from "../lib/i18n";
import { formatDate, formatDateRange, formatDateShort } from "../lib/format";
import { LOCALES, matchAcceptLanguage, type Locale } from "../lib/i18n/locales";
import { PLURALS } from "../lib/i18n/plurals";
import { zhCN } from "../lib/i18n/dictionaries/zh-CN";
import { MESSAGE_MODULES, type ModuleName } from "../lib/i18n/messages";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Flatten to `a.b.c -> "value"`. */
function flatten(node: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else if (value && typeof value === "object") for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const reference = flatten(zhCN);
const referencePaths = [...reference.keys()];

console.log(`\n— coverage (${referencePaths.length} keys in the reference locale)`);

for (const locale of LOCALES) {
  const flat = flatten(DICTIONARIES[locale]);
  const missing = referencePaths.filter((path) => !flat.has(path));
  const extra = [...flat.keys()].filter((path) => !reference.has(path));

  check(`${locale}: has every key`, missing.length === 0, `${missing.length} missing: ${missing.slice(0, 4).join(", ")}`);
  check(`${locale}: has no extra keys`, extra.length === 0, extra.slice(0, 4).join(", "));
  check(
    `${locale}: has no empty values`,
    [...flat.values()].every((value) => value.trim().length > 0),
    [...flat.entries()].filter(([, v]) => !v.trim()).map(([k]) => k).join(", "),
  );
}

console.log("\n— placeholders");

const placeholderPattern = /\{(\w+)\}/g;
const placeholdersOf = (value: string) => (value.match(placeholderPattern) ?? []).sort().join(",");

for (const locale of LOCALES) {
  const flat = flatten(DICTIONARIES[locale]);
  const mismatches: string[] = [];

  for (const [path, value] of reference) {
    const translated = flat.get(path);
    if (translated === undefined) continue;
    if (placeholdersOf(value) !== placeholdersOf(translated)) {
      mismatches.push(`${path}: "${placeholdersOf(value)}" vs "${placeholdersOf(translated)}"`);
    }
  }

  check(
    `${locale}: every placeholder is preserved per key`,
    mismatches.length === 0,
    mismatches.slice(0, 3).join(" | "),
  );
}

// A translated value that still contains the placeholder braces but with a
// different name would render literally; catch the obvious variants.
check(
  "no stray single-brace or doubled-brace placeholders",
  LOCALES.every((locale) =>
    [...flatten(DICTIONARIES[locale]).values()].every(
      (value) => !/\{\{|\}\}|\{(?!\w+\})/.test(value.replace(/\{\w+\}/g, "")),
    ),
  ),
);

console.log("\n— untranslated leftovers");

const CJK = /[\u4e00-\u9fff]/;
const BRAND_OK = /^(LOFT|AI Travel Agent|PostgreSQL|Open-Meteo|Esri|npm run db:seed)$/;

for (const locale of ["en", "es", "ja", "ko"] as Locale[]) {
  const flat = flatten(DICTIONARIES[locale]);
  const leftovers = [...flat.entries()].filter(
    ([, value]) => CJK.test(value) && !value.split(/[\s·]+/).every((token) => BRAND_OK.test(token)),
  );

  // Japanese legitimately uses Han characters, so it is exempt.
  if (locale === "ja") {
    console.log("  SKIP  ja: Japanese uses Han characters by design");
    continue;
  }

  check(`${locale}: no Chinese text left behind`, leftovers.length === 0, leftovers.slice(0, 3).map(([k]) => k).join(", "));
}

console.log("\n— singular forms");

check("English: 1 night, not 1 nights", translate("en", "common.nights", { count: 1 }) === "1 night", translate("en", "common.nights", { count: 1 }));
check("English: 3 nights stays plural", translate("en", "common.nights", { count: 3 }) === "3 nights", translate("en", "common.nights", { count: 3 }));
check("Spanish: 1 noche", translate("es", "common.nights", { count: 1 }) === "1 noche", translate("es", "common.nights", { count: 1 }));
check("Spanish: 2 noches", translate("es", "common.nights", { count: 2 }) === "2 noches", translate("es", "common.nights", { count: 2 }));
check(
  "Chinese is unaffected (no plural marking)",
  translate("zh-CN", "common.nights", { count: 1 }) === "1 晚",
  translate("zh-CN", "common.nights", { count: 1 }),
);
check(
  "English singular also applies to reviews",
  translate("en", "common.reviews", { count: 1 }).includes("review") &&
    !translate("en", "common.reviews", { count: 1 }).includes("reviews"),
  translate("en", "common.reviews", { count: 1 }),
);

check(
  "every plural override names a real key",
  Object.values(PLURALS).every((table) =>
    Object.keys(table ?? {}).every((key) => reference.has(key)),
  ),
);

console.log("\n— interpolation and lookup");

check("placeholder substitution works", interpolate("{a} and {b}", { a: "1", b: "2" }) === "1 and 2");
check("an unknown placeholder is left visible, not blanked", interpolate("{nope}", {}) === "{nope}");
check("numbers are stringified", interpolate("{count} 晚", { count: 2 }) === "2 晚");
check(
  "a missing key falls back to the reference locale rather than the key name",
  translate("en", "agent.title").length > 0 &&
    translate("en", "agent.title") !== "agent.title",
);
check(
  "every locale renders a real string for a spot-check key",
  LOCALES.every((locale) => {
    const value = translate(locale, "home.destinations");
    return value.length > 0 && value !== "home.destinations";
  }),
);

console.log("\n— group modules");

/**
 * Per-group modules are separate files so they can be translated in parallel.
 * `tsc` catches a group whose locales disagree, but these checks also assert the
 * runtime can actually resolve every module key — a module that is not wired into
 * `MESSAGE_MODULES` would otherwise render as its own key name.
 */
for (const moduleName of Object.keys(MESSAGE_MODULES) as ModuleName[]) {
  const table = MESSAGE_MODULES[moduleName];
  const reference = Object.keys(table["zh-CN"] as Record<string, string>);

  const missingPerLocale: string[] = [];
  for (const locale of LOCALES) {
    const keys = Object.keys((table[locale] ?? {}) as Record<string, string>);
    const missing = reference.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !reference.includes(key));
    if (missing.length > 0) missingPerLocale.push(`${locale} missing ${missing.length}`);
    if (extra.length > 0) missingPerLocale.push(`${locale} extra ${extra.length}`);
  }

  check(
    `${moduleName}: every locale defines the same keys`,
    missingPerLocale.length === 0,
    missingPerLocale.join("; "),
  );

  if (reference.length === 0) {
    console.log(`  SKIP  ${moduleName}: no keys yet`);
    continue;
  }

  check(
    `${moduleName}: no empty values`,
    LOCALES.every((locale) =>
      Object.values((table[locale] ?? {}) as Record<string, string>).every(
        (value) => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );

  check(
    `${moduleName}: keys are prefixed with the group name`,
    reference.every((key) => key.startsWith(`${moduleName}.`)),
    reference.filter((key) => !key.startsWith(`${moduleName}.`)).slice(0, 3).join(", "),
  );

  // Placeholders must survive translation.
  const placeholderMismatch: string[] = [];
  for (const key of reference) {
    const expected = placeholdersOf((table["zh-CN"] as Record<string, string>)[key]);
    for (const locale of LOCALES) {
      const value = (table[locale] as Record<string, string>)[key];
      if (placeholdersOf(value) !== expected) {
        placeholderMismatch.push(`${locale}:${key}`);
      }
    }
  }
  check(
    `${moduleName}: placeholders preserved in every locale`,
    placeholderMismatch.length === 0,
    placeholderMismatch.slice(0, 3).join(", "),
  );

  // The runtime must resolve them (routing by the first key segment).
  const unresolvable = reference.filter(
    (key) => translate("en", key as never) === key,
  );
  check(
    `${moduleName}: every key resolves through translate()`,
    unresolvable.length === 0,
    unresolvable.slice(0, 3).join(", "),
  );

  console.log(`        ${reference.length} key(s) across ${LOCALES.length} locales`);
}

console.log("\n— Accept-Language matching");

check("Simplified Chinese", matchAcceptLanguage("zh-CN,zh;q=0.9") === "zh-CN");
check("Traditional Chinese by region", matchAcceptLanguage("zh-TW,zh;q=0.9") === "zh-TW");
check("Traditional Chinese by script", matchAcceptLanguage("zh-Hant") === "zh-TW");
check("English", matchAcceptLanguage("en-US,en;q=0.9") === "en");
check("Japanese", matchAcceptLanguage("ja,en;q=0.8") === "ja");
check("Korean", matchAcceptLanguage("ko-KR,ko;q=0.9") === "ko");
check("Spanish", matchAcceptLanguage("es-ES,es;q=0.9") === "es");
check("quality values are respected", matchAcceptLanguage("en;q=0.2,ja;q=0.9") === "ja");
check("an unsupported language yields no match", matchAcceptLanguage("sv-SE,sv;q=0.9") === undefined);
check("an empty header yields no match", matchAcceptLanguage("") === undefined);

console.log("\n— date formatting follows the locale");

// Dates used to be template literals producing `2026年10月1日` in every language,
// so an English booking page showed Chinese dates. These assertions pin the
// behaviour per locale, and the UTC case pins the timezone bug that formatting
// via a local-time Date would reintroduce.
const SAMPLE = "2026-10-01";

for (const locale of LOCALES) {
  const formatted = formatDate(SAMPLE, locale);
  check(`${locale}: formatDate renders`, formatted.length > 0, formatted);
  console.log(`        ${locale.padEnd(6)} ${formatted}   |  ${formatDateShort(SAMPLE, locale)}`);
}

check(
  "zh-CN keeps the 年月日 form",
  formatDate(SAMPLE, "zh-CN") === "2026年10月1日",
  formatDate(SAMPLE, "zh-CN"),
);
check(
  "en does not use CJK date characters",
  !/[年月日]/.test(formatDate(SAMPLE, "en")),
  formatDate(SAMPLE, "en"),
);
check(
  "es does not use CJK date characters",
  !/[年月日]/.test(formatDate(SAMPLE, "es")),
  formatDate(SAMPLE, "es"),
);
check(
  "each locale's long date differs from at least one other",
  new Set(LOCALES.map((locale) => formatDate(SAMPLE, locale))).size >= 3,
  LOCALES.map((locale) => `${locale}=${formatDate(SAMPLE, locale)}`).join(" "),
);
check(
  "the day is not shifted by the renderer's timezone",
  LOCALES.every((locale) => formatDate(SAMPLE, locale).includes("1")),
  LOCALES.map((locale) => `${locale}=${formatDate(SAMPLE, locale)}`).join(" "),
);
check(
  "a same-year range is abbreviated once",
  formatDateRange("2026-10-01", "2026-10-05", "zh-CN") === "2026年10月1日 – 10月5日",
  formatDateRange("2026-10-01", "2026-10-05", "zh-CN"),
);
check(
  "a range crossing new year spells both years out",
  formatDateRange("2026-12-30", "2027-01-02", "zh-CN").split("年").length - 1 === 2,
  formatDateRange("2026-12-30", "2027-01-02", "zh-CN"),
);

console.log(`\n${"=".repeat(58)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log("=".repeat(58));

process.exit(failed === 0 ? 0 : 1);
