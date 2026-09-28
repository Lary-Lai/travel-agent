/**
 * Localised listing titles and addresses.
 *
 * The titles are *generated* from localised building blocks, so the things that
 * can go wrong are structural: a missing locale, an unfilled placeholder, or a
 * template lookup that silently fell back to Chinese. These checks cover that,
 * and they need the database (run `npm run db:seed` first).
 *
 *     npx tsx scripts/verify-listing-i18n.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { GENERATED_LOCALES, LISTING_TEXT } from "../lib/i18n/listing-text";
import { LOCALES } from "../lib/i18n/locales";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55432/travel_agent?schema=public";
const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

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

console.log("\n— the building blocks");

for (const locale of GENERATED_LOCALES) {
  const text = LISTING_TEXT[locale];
  check(`${locale}: module is registered`, Boolean(text));
  if (!text) continue;
  check(
    `${locale}: has 120 neighbourhoods`,
    Object.keys(text.neighborhoods).length === 120,
    String(Object.keys(text.neighborhoods).length),
  );
  check(
    `${locale}: has 10 adjectives`,
    Object.keys(text.adjectives).length === 10,
    String(Object.keys(text.adjectives).length),
  );
  check(
    `${locale}: every property type has templates`,
    ["APARTMENT", "HOUSE", "HOTEL", "VILLA", "LOFT", "GUESTHOUSE"].every(
      (type) => (text.templates[type] ?? []).length > 0,
    ),
  );
}

console.log("\n— the stored data");

// `tsx` runs these scripts as CJS, which has no top-level await.
async function main(): Promise<void> {
const total = await prisma.listing.count();
const rows = await prisma.listing.findMany({
  select: { title: true, location: true, titleI18n: true, locationI18n: true },
});

check("listings exist", total > 0, String(total));
check(
  "every listing has both maps",
  rows.every((row) => row.titleI18n && row.locationI18n),
  String(rows.filter((row) => !row.titleI18n || !row.locationI18n).length) + " missing",
);

const missingLocale: string[] = [];
for (const row of rows) {
  const titles = (row.titleI18n ?? {}) as Record<string, string>;
  const places = (row.locationI18n ?? {}) as Record<string, string>;
  for (const locale of LOCALES) {
    if (!titles[locale] || !places[locale]) missingLocale.push(`${row.title}/${locale}`);
  }
}
check(
  "every listing covers all six locales",
  missingLocale.length === 0,
  missingLocale.slice(0, 3).join(", "),
);

// An unfilled placeholder means the template lookup or the substitution failed —
// it would render literally to the user, so it must never reach the database.
const unfilled = rows.filter((row) =>
  Object.values((row.titleI18n ?? {}) as Record<string, string>).some((value) => /\{\w+\}/.test(value)),
);
check("no placeholder survived into the data", unfilled.length === 0, unfilled[0]?.title ?? "");

const empties = rows.filter((row) =>
  Object.values((row.titleI18n ?? {}) as Record<string, string>).some((value) => !value?.trim()),
);
check("no empty titles", empties.length === 0, empties[0]?.title ?? "");

// The Chinese values must be untouched: the API and the Agent read them.
const chinese = /[\u4e00-\u9fff]/;
check(
  "the authored Chinese title is preserved",
  rows.every((row) => chinese.test(row.title)),
  rows.find((row) => !chinese.test(row.title))?.title ?? "",
);

// A non-Chinese locale that still contains Han characters means a fallback leaked.
for (const locale of ["en", "es"] as const) {
  const leaked = rows.filter((row) =>
    chinese.test(((row.titleI18n ?? {}) as Record<string, string>)[locale] ?? ""),
  );
  check(
    `${locale}: no Chinese left in the title`,
    leaked.length === 0,
    leaked[0] ? `${leaked[0].title} -> ${((leaked[0].titleI18n ?? {}) as Record<string, string>)[locale]}` : "",
  );
}

check(
  "every localised address names its city",
  rows.every((row) => {
    const places = (row.locationI18n ?? {}) as Record<string, string>;
    return Object.values(places).every((value) => value.includes(", "));
  }),
);

const sample = rows[0];
console.log("\n  sample:");
for (const locale of LOCALES) {
  const titles = (sample.titleI18n ?? {}) as Record<string, string>;
  const places = (sample.locationI18n ?? {}) as Record<string, string>;
  console.log(`    ${locale.padEnd(6)} ${titles[locale]}  ·  ${places[locale]}`);
}

await prisma.$disconnect();

console.log(`\n${"=".repeat(58)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log("=".repeat(58));

process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
