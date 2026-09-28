/**
 * Guest-count stepper.
 *
 * The bug being guarded against: the original inline stepper made the value 1
 * unreachable (the "any" state stepped up to 2, and stepping down from 2 fell
 * back to "any"), so a solo traveller could never be selected.
 *
 *     npx tsx scripts/verify-guests.ts
 */
import {
  decreaseGuests,
  guestOptions,
  GUESTS_ANY,
  guestsLabel,
  increaseGuests,
} from "../lib/guests";
import { createTranslator } from "../lib/i18n";
import { MAX_GUESTS } from "../lib/pricing";

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

const zh = createTranslator("zh-CN");
const en = createTranslator("en");

console.log("\n— guest stepper");

check("any label reads 不限", guestsLabel(zh, GUESTS_ANY) === "不限", guestsLabel(zh, GUESTS_ANY));
check("one guest reads 1 位", guestsLabel(zh, 1) === "1 位", guestsLabel(zh, 1));
check("four guests read 4 位", guestsLabel(zh, 4) === "4 位", guestsLabel(zh, 4));

// The label used to be hardcoded Chinese, which is why the English filter panel
// showed 不限 in its guest stepper.
check("the label follows the locale", guestsLabel(en, 2) === "2 guests", guestsLabel(en, 2));
check(
  "and the any-state is translated too",
  guestsLabel(en, GUESTS_ANY) === "Any" && !/[\u4e00-\u9fff]/.test(guestsLabel(en, GUESTS_ANY)),
  guestsLabel(en, GUESTS_ANY),
);
// Only Latin-script locales are scanned for CJK: Japanese legitimately uses
// kanji in its own labels, so a blanket "no CJK" rule would fail correct output.
check(
  "no locale leaks Chinese into its guest labels",
  (["en", "es"] as const).every(
    (locale) => !/[\u4e00-\u9fff]/.test(guestsLabel(createTranslator(locale), 3)),
  ),
  guestsLabel(en, 3),
);
// zh-TW is excluded on purpose: 位 is written identically in both Chinese
// scripts, so an identical label there is correct, not a copy-paste slip.
check(
  "and every other locale renders its own wording",
  (["ja", "ko", "es"] as const).every(
    (locale) => guestsLabel(createTranslator(locale), 3) !== guestsLabel(zh, 3),
  ),
  (["ja", "ko", "es"] as const)
    .map((locale) => `${locale}=${guestsLabel(createTranslator(locale), 3)}`)
    .join(" "),
);

console.log("\n— the regression: 1 must be selectable");
check("不限 steps up to 1, not 2", increaseGuests(GUESTS_ANY) === 1, String(increaseGuests(GUESTS_ANY)));
check("1 steps up to 2", increaseGuests(1) === 2, String(increaseGuests(1)));
check("2 steps down to 1", decreaseGuests(2) === 1, String(decreaseGuests(2)));
check("1 steps down to 不限", decreaseGuests(1) === GUESTS_ANY, String(decreaseGuests(1)));

console.log("\n— bounds");
check("steps up no further than 16", increaseGuests(MAX_GUESTS) === MAX_GUESTS);
check("stepping up past the cap is a no-op", increaseGuests(MAX_GUESTS + 5) === MAX_GUESTS);
check("不限 cannot be stepped below (stays 不限)", decreaseGuests(GUESTS_ANY) === GUESTS_ANY);
check("a negative value is clamped to 不限", decreaseGuests(-3) === GUESTS_ANY);

console.log("\n— reachability (the property the bug violated)");
const walked: number[] = [GUESTS_ANY];
for (let guard = 0; guard < 100; guard++) {
  const next = increaseGuests(walked[walked.length - 1]);
  if (next === walked[walked.length - 1]) break;
  walked.push(next);
}
const expected = Array.from({ length: MAX_GUESTS + 1 }, (_, index) => index);
check(
  "stepping up from 不限 visits every value exactly once",
  JSON.stringify(walked) === JSON.stringify(expected),
  JSON.stringify(walked),
);
check("1 is among the reachable values", walked.includes(1));

const back: number[] = [MAX_GUESTS];
for (let guard = 0; guard < 100; guard++) {
  const next = decreaseGuests(back[back.length - 1]);
  back.push(next);
  if (next === GUESTS_ANY) break;
}
check(
  "stepping down from the cap returns to 不限",
  back[back.length - 1] === GUESTS_ANY,
  JSON.stringify(back),
);
check("stepping down passes through 1", back.includes(1));
check("the full step-down is the reverse of the step-up", JSON.stringify(back) === JSON.stringify([...walked].reverse()), JSON.stringify(back));

check(
  "guestOptions enumerates 不限 through the cap",
  JSON.stringify(guestOptions()) === JSON.stringify(expected),
);

console.log(`\n${"=".repeat(56)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log("=".repeat(56));

process.exit(failed === 0 ? 0 : 1);
