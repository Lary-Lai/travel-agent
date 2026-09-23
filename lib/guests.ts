/**
 * Guest-count stepper.
 *
 * Extracted from the filter panel so the transitions can be unit-tested — the
 * original inline version had two off-by-one bugs that made the value **1
 * unreachable**: 不限 stepped up to 2 (skipping the solo traveller), and
 * stepping down from 2 fell straight back to 不限.
 *
 * The domain is: 不限 (0) → 1 → 2 → … → MAX_GUESTS. 0 means "no constraint",
 * which is why it is not simply "0 guests".
 */
import { MAX_GUESTS } from "./pricing";

/** The UI shows 不限 for this value; the API omits the filter entirely. */
export const GUESTS_ANY = 0;

export function guestsLabel(value: number): string {
  return value === GUESTS_ANY ? "不限" : `${value} 位`;
}

/** Step up. From 不限 the next stop is 1, not 2. */
export function increaseGuests(current: number): number {
  if (current >= MAX_GUESTS) return MAX_GUESTS;
  return current === GUESTS_ANY ? 1 : current + 1;
}

/** Step down. From 1 we return to 不限; from 2 we land on 1. */
export function decreaseGuests(current: number): number {
  if (current <= 1) return GUESTS_ANY;
  return current - 1;
}

/** Every selectable value, in order — handy for a segmented control or tests. */
export function guestOptions(): number[] {
  return Array.from({ length: MAX_GUESTS + 1 }, (_, index) => index);
}
