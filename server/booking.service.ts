/**
 * Booking service.
 *
 * Price and availability are ALWAYS recomputed here from the listing row —
 * client-supplied totals are ignored, so the stored order cannot be tampered
 * with. No real payment is processed (per the brief).
 */
import { prisma } from "../lib/db";
import { formatDate, parseDateOnly, todayUtc } from "../lib/format";
import { badRequest, conflict, forbidden, notFound } from "../lib/http";
import { MAX_GUESTS, MAX_NIGHTS, calculatePrice, nightsBetween } from "../lib/pricing";
import { BOOKING_STATUS_LABELS, type BookingDto, type BookingStatusValue } from "../types";
import { Prisma } from "../lib/generated/prisma/client";
import { LISTING_INCLUDE, mapListingRow } from "./listing.service";

const BOOKING_INCLUDE = {
  listing: { include: LISTING_INCLUDE },
} satisfies Prisma.BookingInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

const ACTIVE_STATUSES: BookingStatusValue[] = ["CONFIRMED", "PENDING"];

function mapBooking(row: BookingRow): BookingDto {
  const status = row.status as BookingStatusValue;
  return {
    id: row.id,
    status,
    statusLabel: BOOKING_STATUS_LABELS[status] ?? row.status,
    checkIn: row.checkIn.toISOString(),
    checkOut: row.checkOut.toISOString(),
    guests: row.guests,
    nights: row.nights,
    roomPrice: row.roomPrice,
    cleaningFee: row.cleaningFee,
    serviceFee: row.serviceFee,
    totalPrice: row.totalPrice,
    createdAt: row.createdAt.toISOString(),
    listing: mapListingRow(row.listing),
  };
}

export type CreateBookingInput = {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
};

export async function createBooking(
  userId: string,
  input: CreateBookingInput,
): Promise<BookingDto> {
  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: {
      id: true,
      title: true,
      pricePerNight: true,
      maxGuests: true,
      hostId: true,
    },
  });
  if (!listing) throw notFound("房源不存在或已下架");

  // Never let a host book their own listing in this demo.
  if (listing.hostId === userId) throw badRequest("不能预订自己发布的房源");

  const guests = Math.floor(input.guests);
  if (!Number.isFinite(guests) || guests < 1) throw badRequest("入住人数至少为 1 人");
  if (guests > MAX_GUESTS) throw badRequest(`单笔订单最多支持 ${MAX_GUESTS} 人`);
  if (guests > listing.maxGuests) {
    throw badRequest(`「${listing.title}」最多可住 ${listing.maxGuests} 人，请调整人数或更换房源`);
  }

  const checkIn = parseDateOnly(input.checkIn);
  const checkOut = parseDateOnly(input.checkOut);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    throw badRequest("入住或退房日期格式不正确");
  }

  const today = todayUtc();
  if (checkIn.getTime() < today.getTime()) throw badRequest("入住日期不能早于今天");
  if (checkOut.getTime() <= checkIn.getTime()) throw badRequest("退房日期必须晚于入住日期");

  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw badRequest("入住至少需要 1 晚");
  if (nights > MAX_NIGHTS) throw badRequest(`单笔订单最长 ${MAX_NIGHTS} 晚`);

  // Availability: reject any overlap with an active booking.
  const clash = await prisma.booking.findFirst({
    where: {
      listingId: listing.id,
      status: { in: ACTIVE_STATUSES },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { checkIn: true, checkOut: true },
  });
  if (clash) {
    throw conflict(
      `该房源在 ${formatDate(clash.checkIn)} – ${formatDate(clash.checkOut)} 已被预订，请选择其他日期`,
    );
  }

  // Server-side price calculation; the client never supplies these numbers.
  const price = calculatePrice(listing.pricePerNight, nights);

  const row = await prisma.booking.create({
    data: {
      userId,
      listingId: listing.id,
      checkIn,
      checkOut,
      guests,
      nights: price.nights,
      roomPrice: price.roomPrice,
      cleaningFee: price.cleaningFee,
      serviceFee: price.serviceFee,
      totalPrice: price.totalPrice,
      status: "CONFIRMED",
    },
    include: BOOKING_INCLUDE,
  });

  return mapBooking(row);
}

export async function listBookings(userId: string): Promise<BookingDto[]> {
  const rows = await prisma.booking.findMany({
    where: { userId },
    include: BOOKING_INCLUDE,
    // Upcoming trips first, then most recently booked.
    orderBy: [{ checkIn: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(mapBooking);
}

export async function getBooking(userId: string, bookingId: string): Promise<BookingDto> {
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: BOOKING_INCLUDE,
  });
  if (!row) throw notFound("订单不存在");
  if (row.userId !== userId) throw forbidden("无权查看该订单");
  return mapBooking(row);
}

export async function cancelBooking(userId: string, bookingId: string): Promise<BookingDto> {
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: BOOKING_INCLUDE,
  });
  if (!row) throw notFound("订单不存在");
  if (row.userId !== userId) throw forbidden("无权操作该订单");
  if (row.status === "CANCELLED") throw conflict("该订单已取消");

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CANCELLED" },
    include: BOOKING_INCLUDE,
  });
  return mapBooking(updated);
}

/** Trip totals for the Trips page summary strip. */
export async function getBookingStats(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { userId },
    select: { status: true, totalPrice: true, checkIn: true, nights: true },
  });

  const today = todayUtc();
  const active = bookings.filter((b) => b.status === "CONFIRMED");

  return {
    total: bookings.length,
    upcoming: active.filter((b) => b.checkIn.getTime() >= today.getTime()).length,
    completed: active.filter((b) => b.checkIn.getTime() < today.getTime()).length,
    totalSpend: active.reduce((sum, b) => sum + b.totalPrice, 0),
    totalNights: active.reduce((sum, b) => sum + b.nights, 0),
  };
}
