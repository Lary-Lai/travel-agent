/** Display formatting helpers. Currency is CNY throughout the app. */

import type { Locale } from "@/lib/i18n/locales";

const CNY = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0,
});

/** 1234 -> "¥1,234" */
export function formatCurrency(value: number): string {
  return CNY.format(value);
}

/** Compact price for cards, e.g. "¥1,234". */
export function formatPrice(value: number): string {
  return CNY.format(value);
}

/** Rating with exactly one decimal, e.g. 4.9 */
export function formatRating(value: number): string {
  return value.toFixed(1);
}

/** Review counts as hotels render them: 1234 -> "1,234" */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

/** Parse a `YYYY-MM-DD` (or ISO) string into a UTC-anchored Date. */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  return new Date(value);
}

/** `2026-10-01` -> `2026-10-01` (date-only, timezone-stable). */
export function toDateOnlyString(value: Date | string): string {
  const d = parseDateOnly(value);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Date formatting goes through `Intl`, per locale.
 *
 * These used to be string templates that hardcoded `2026年10月1日` for every
 * language, so an English or Spanish page showed Chinese dates while every word
 * around them was translated. `timeZone: "UTC"` is load-bearing: a stay from
 * `2026-10-01` is a calendar date, not an instant, and without it anyone west of
 * Greenwich would see their check-in rendered as 9月30日.
 *
 * Formatters are cached because constructing one is the expensive part and these
 * run once per row in long lists.
 */
const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${options.year ?? ""}|${options.month ?? ""}|${options.day ?? ""}`;
  let formatter = DATE_FORMATTERS.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    DATE_FORMATTERS.set(key, formatter);
  }
  return formatter;
}

const LONG_DATE: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" };
const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

/** `2026-10-01` -> `2026年10月1日` (zh), `October 1, 2026` (en), `1 de octubre de 2026` (es) */
export function formatDate(value: string | Date, locale: Locale): string {
  return dateFormatter(locale, LONG_DATE).format(parseDateOnly(value));
}

/** `10月1日` / `Oct 1` — the short form used inside date-range chips. */
export function formatDateShort(value: string | Date, locale: Locale): string {
  return dateFormatter(locale, SHORT_DATE).format(parseDateOnly(value));
}

/** `2026年10月1日 – 10月5日`, or the full form when the years differ. */
export function formatDateRange(
  checkIn: string | Date,
  checkOut: string | Date,
  locale: Locale,
): string {
  const a = parseDateOnly(checkIn);
  const b = parseDateOnly(checkOut);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${formatDate(a, locale)} – ${formatDateShort(b, locale)}`;
  }
  return `${formatDate(a, locale)} – ${formatDate(b, locale)}`;
}

/** Today at UTC midnight — the baseline for date validation. */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(value: Date | string, days: number): Date {
  const d = parseDateOnly(value);
  return new Date(d.getTime() + days * 86_400_000);
}
