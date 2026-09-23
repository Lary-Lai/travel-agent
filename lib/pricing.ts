/**
 * Price calculation — the single source of truth shared by the detail page, the
 * Booking service and the Agent's tools, so the number the user sees is exactly
 * the number that gets stored.
 *
 *   roomPrice (pricePerNight x nights) + cleaningFee + serviceFee = totalPrice
 */
import { parseDateOnly } from "./format";

/** Service fee as a share of the room subtotal. */
export const SERVICE_FEE_RATE = 0.12;

/** Cleaning fee as a share of one night's price (bigger place => pricier clean). */
export const CLEANING_FEE_RATE = 0.4;

export const CLEANING_FEE_MIN = 50;
export const CLEANING_FEE_MAX = 400;

export const MAX_NIGHTS = 365;
export const MAX_GUESTS = 16;

export type PriceBreakdown = {
  nights: number;
  pricePerNight: number;
  roomPrice: number;
  cleaningFee: number;
  serviceFee: number;
  totalPrice: number;
};

/** Whole nights between two date-only values. Returns 0 when not computable. */
export function nightsBetween(checkIn: string | Date, checkOut: string | Date): number {
  const start = parseDateOnly(checkIn).getTime();
  const end = parseDateOnly(checkOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const diff = Math.round((end - start) / 86_400_000);
  return diff > 0 ? diff : 0;
}

export function calculateCleaningFee(pricePerNight: number): number {
  const raw = pricePerNight * CLEANING_FEE_RATE;
  const clamped = Math.min(Math.max(raw, CLEANING_FEE_MIN), CLEANING_FEE_MAX);
  return Math.round(clamped / 10) * 10;
}

export function calculatePrice(pricePerNight: number, nights: number): PriceBreakdown {
  const safeNights = Math.max(0, Math.floor(nights));
  const roomPrice = pricePerNight * safeNights;
  const cleaningFee = safeNights > 0 ? calculateCleaningFee(pricePerNight) : 0;
  const serviceFee = Math.round(roomPrice * SERVICE_FEE_RATE);

  return {
    nights: safeNights,
    pricePerNight,
    roomPrice,
    cleaningFee,
    serviceFee,
    totalPrice: roomPrice + cleaningFee + serviceFee,
  };
}

/** Convenience wrapper for date-range based callers. */
export function calculatePriceForRange(
  pricePerNight: number,
  checkIn: string | Date,
  checkOut: string | Date,
): PriceBreakdown {
  return calculatePrice(pricePerNight, nightsBetween(checkIn, checkOut));
}
