/**
 * Date handling across the calendar boundary.
 *
 * Run with: npx tsx scripts/verify-dates.ts
 *
 * ## The bug this exists for
 *
 * A stay "from 2026-10-21" is a calendar square, not an instant, so `lib/format` anchors
 * date-only values at UTC midnight (`parseDateOnly` / `toDateOnlyString`). But
 * react-day-picker hands back **local midnight**: picking the 21st in UTC+8 yields
 * `2026-10-21T00:00+08:00`. Reading that with the UTC accessors gives the 20th, so the
 * search bar showed 10月20日 after clicking the 21st — and 10月28日 after the 29th.
 *
 * The failure is **invisible west of Greenwich** (a negative offset rounds forward to
 * the same day), which is why it survived until a user in China hit it. These assertions
 * therefore matter most when the machine running them has a positive offset; the last
 * check says so explicitly rather than pretending to cover a case it cannot.
 */
import { formatDate, formatDateShort, fromCalendarDate, parseDateOnly, toCalendarDate, toDateOnlyString } from "../lib/format";

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

/** What `<Calendar>` produces when the user clicks a day: local midnight. */
const picked = (year: number, month: number, day: number) => new Date(year, month - 1, day);

const offsetHours = -new Date(2026, 9, 21).getTimezoneOffset() / 60;
console.log(`\n— calendar → date-only (this machine is UTC${offsetHours >= 0 ? "+" : ""}${offsetHours})`);

check(
  "clicking the 21st records the 21st",
  toDateOnlyString(fromCalendarDate(picked(2026, 10, 21))) === "2026-10-21",
  toDateOnlyString(fromCalendarDate(picked(2026, 10, 21))),
);
check(
  "clicking the 29th records the 29th",
  toDateOnlyString(fromCalendarDate(picked(2026, 10, 29))) === "2026-10-29",
  toDateOnlyString(fromCalendarDate(picked(2026, 10, 29))),
);
check(
  "a stay never shifts by a day: 21 -> 29 is 8 nights",
  Math.round(
    (fromCalendarDate(picked(2026, 10, 29)).getTime() -
      fromCalendarDate(picked(2026, 10, 21)).getTime()) /
      86_400_000,
  ) === 8,
);
check(
  "the first of a month stays in that month",
  toDateOnlyString(fromCalendarDate(picked(2026, 10, 1))) === "2026-10-01",
  toDateOnlyString(fromCalendarDate(picked(2026, 10, 1))),
);
check(
  "new year's day does not become last year's eve",
  toDateOnlyString(fromCalendarDate(picked(2027, 1, 1))) === "2027-01-01",
  toDateOnlyString(fromCalendarDate(picked(2027, 1, 1))),
);
check(
  "new year's eve stays on the 31st",
  toDateOnlyString(fromCalendarDate(picked(2026, 12, 31))) === "2026-12-31",
  toDateOnlyString(fromCalendarDate(picked(2026, 12, 31))),
);

console.log("\n— date-only → calendar (the other direction)");
const shown = toCalendarDate("2026-10-21");
check("the grid is given local midnight on the right day", shown.getDate() === 21 && shown.getMonth() === 9, shown.toString());
check(
  "a full round trip is lossless",
  toDateOnlyString(fromCalendarDate(toCalendarDate("2026-10-21"))) === "2026-10-21",
);
check(
  "and it is lossless for a month edge too",
  toDateOnlyString(fromCalendarDate(toCalendarDate("2026-11-01"))) === "2026-11-01",
);

console.log("\n— the pre-existing string contract is unchanged");
check(
  "parseDateOnly still anchors at UTC midnight",
  (() => {
    const d = parseDateOnly("2026-10-21");
    return d.getUTCFullYear() === 2026 && d.getUTCMonth() === 9 && d.getUTCDate() === 21;
  })(),
);
check("toDateOnlyString of a date-only string is a no-op", toDateOnlyString("2026-10-21") === "2026-10-21");
check(
  "formatted dates do not shift either",
  /21/.test(formatDate("2026-10-21", "en")) && /21/.test(formatDateShort("2026-10-21", "en")),
  formatDate("2026-10-21", "en"),
);

if (offsetHours <= 0) {
  console.log(
    "\n  NOTE  this machine is at a non-positive offset, so the reported failure mode " +
      "(the old code reading local midnight with UTC accessors) cannot be demonstrated here.",
  );
}

console.log(`\n${"=".repeat(56)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log("=".repeat(56));
process.exit(failed === 0 ? 0 : 1);
