/**
 * Guest-count stepper.
 *
 * The bug being guarded against: the original inline stepper made the value 1
 * unreachable (不限 stepped up to 2, and stepping down from 2 fell back to 不限),
 * so a solo traveller could never be selected.
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

console.log("\n— guest stepper");

check("any label reads 不限", guestsLabel(GUESTS_ANY) === "不限", guestsLabel(GUESTS_ANY));
check("one guest reads 1 位", guestsLabel(1) === "1 位", guestsLabel(1));
check("four guests read 4 位", guestsLabel(4) === "4 位", guestsLabel(4));

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
