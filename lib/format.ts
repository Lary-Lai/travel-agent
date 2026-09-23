/** Display formatting helpers. Currency is CNY throughout the app. */

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

/** `2026-10-01` -> `2026年10月1日` */
export function formatDate(value: string | Date): string {
  const d = parseDateOnly(value);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

/** `10月1日` — the short form used inside date-range chips. */
export function formatDateShort(value: string | Date): string {
  const d = parseDateOnly(value);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

/** `2026年10月1日 – 10月5日` */
export function formatDateRange(checkIn: string | Date, checkOut: string | Date): string {
  const a = parseDateOnly(checkIn);
  const b = parseDateOnly(checkOut);
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${formatDate(a)} – ${formatDateShort(b)}`;
  }
  return `${formatDate(a)} – ${formatDate(b)}`;
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
