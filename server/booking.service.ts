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
import {
  REFUND_TIER_LABELS,
  buildRefundTradeNo,
  calculateRefundQuote,
  type RefundQuote,
} from "../lib/refund";
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  REFUND_STATUS_LABELS,
  type BookingDto,
  type BookingStatusValue,
  type PaymentMethodValue,
  type RefundDto,
  type RefundStatusValue,
} from "../types";
import { Prisma } from "../lib/generated/prisma/client";
import { LISTING_INCLUDE, mapListingRow } from "./listing.service";

/** Shared column set so refunds map identically wherever they are queried. */
export const REFUND_SELECT = {
  id: true,
  bookingId: true,
  amount: true,
  status: true,
  tier: true,
  method: true,
  tradeNo: true,
  note: true,
  requestedAt: true,
  completedAt: true,
} satisfies Prisma.RefundSelect;

export type RefundRowShape = Prisma.RefundGetPayload<{ select: typeof REFUND_SELECT }>;

const BOOKING_INCLUDE = {
  listing: { include: LISTING_INCLUDE },
  // A booking can only be refunded once, but read the newest for display.
  refunds: { orderBy: { requestedAt: "desc" as const }, take: 1, select: REFUND_SELECT },
} satisfies Prisma.BookingInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

const ACTIVE_STATUSES: BookingStatusValue[] = ["CONFIRMED", "PENDING"];

export function mapRefundRow(row: RefundRowShape): RefundDto {
  const status = row.status as RefundStatusValue;
  const method = row.method as PaymentMethodValue;

  return {
    id: row.id,
    bookingId: row.bookingId,
    amount: row.amount,
    status,
    statusLabel: REFUND_STATUS_LABELS[status] ?? row.status,
    tier: row.tier,
    tierLabel: REFUND_TIER_LABELS[row.tier as keyof typeof REFUND_TIER_LABELS] ?? row.tier,
    method,
    methodLabel: PAYMENT_METHOD_LABELS[method] ?? method,
    tradeNo: row.tradeNo,
    note: row.note,
    requestedAt: row.requestedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    isSettled: row.status === "SUCCEEDED",
  };
}

function mapBooking(row: BookingRow): BookingDto {
  const status = row.status as BookingStatusValue;
  const paymentMethod = (row.paymentMethod as PaymentMethodValue | null) ?? null;

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
    paymentMethod,
    paymentMethodLabel: paymentMethod ? (PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod) : null,
    paidAt: row.paidAt?.toISOString() ?? null,
    paymentTradeNo: row.paymentTradeNo,
    isPaid: row.paidAt !== null,
    refund: row.refunds.length > 0 ? mapRefundRow(row.refunds[0]) : null,
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
      // Held, not confirmed: the dates are blocked until checkout is paid.
      status: "PENDING",
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

/**
 * Preview the refund a cancellation would produce, WITHOUT cancelling.
 * The UI calls this so the confirmation dialog shows real numbers.
 */
export async function getRefundQuote(
  userId: string,
  bookingId: string,
): Promise<RefundQuote & { bookingId: string; alreadyCancelled: boolean }> {
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      userId: true,
      status: true,
      checkIn: true,
      roomPrice: true,
      cleaningFee: true,
      serviceFee: true,
      totalPrice: true,
      paidAt: true,
    },
  });
  if (!row) throw notFound("订单不存在");
  if (row.userId !== userId) throw forbidden("无权查看该订单");

  const quote = calculateRefundQuote({
    checkIn: row.checkIn,
    roomPrice: row.roomPrice,
    cleaningFee: row.cleaningFee,
    serviceFee: row.serviceFee,
    totalPrice: row.totalPrice,
    isPaid: row.paidAt !== null,
    cancelled: row.status === "CANCELLED",
  });

  return { ...quote, bookingId, alreadyCancelled: row.status === "CANCELLED" };
}

/**
 * Cancel a booking and, when it was paid, record a refund.
 *
 * The refund amount comes from the shared cancellation policy — never from the
 * client — and the refund row is created in the SAME transaction as the status
 * change, so a cancellation can never exist without its refund.
 */
export async function cancelBooking(userId: string, bookingId: string): Promise<BookingDto> {
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: BOOKING_INCLUDE,
  });
  if (!row) throw notFound("订单不存在");
  if (row.userId !== userId) throw forbidden("无权操作该订单");
  if (row.status === "CANCELLED") throw conflict("该订单已取消");

  const quote = calculateRefundQuote({
    checkIn: row.checkIn,
    roomPrice: row.roomPrice,
    cleaningFee: row.cleaningFee,
    serviceFee: row.serviceFee,
    totalPrice: row.totalPrice,
    isPaid: row.paidAt !== null,
  });

  const shouldRefund = row.paidAt !== null && quote.amount > 0;
  const refundedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    if (shouldRefund) {
      await tx.refund.create({
        data: {
          bookingId: row.id,
          amount: quote.amount,
          status: "PROCESSING",
          reason: "USER_CANCELLED",
          tier: quote.tier,
          // Refunds always return to the channel that was charged.
          method: row.paymentMethod ?? "CARD",
          tradeNo: buildRefundTradeNo(refundedAt),
          note: quote.description,
        },
      });
    }

    return tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
      include: BOOKING_INCLUDE,
    });
  });

  return mapBooking(updated);
}

/**
 * Simulated checkout.
 *
 * No real gateway is involved: this records which channel the user chose,
 * stamps a trade number so the confirmation screen has something concrete to
 * show, and moves the booking from PENDING to CONFIRMED.
 *
 * Ownership, cancellability and double-payment are all re-checked here, so the
 * endpoint cannot be used to confirm someone else's order or pay twice.
 */
export async function payBooking(
  userId: string,
  bookingId: string,
  method: PaymentMethodValue,
): Promise<BookingDto> {
  if (!PAYMENT_METHODS.includes(method)) {
    throw badRequest("不支持的支付方式");
  }

  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: BOOKING_INCLUDE,
  });
  if (!row) throw notFound("订单不存在");
  if (row.userId !== userId) throw forbidden("无权操作该订单");
  if (row.status === "CANCELLED") throw conflict("该订单已取消，无法支付");
  if (row.paidAt) throw conflict("该订单已完成支付，请勿重复支付");

  const paidAt = new Date();

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: "CONFIRMED",
      paymentMethod: method,
      paidAt,
      paymentTradeNo: buildTradeNo(method, paidAt),
    },
    include: BOOKING_INCLUDE,
  });

  return mapBooking(updated);
}

/** Plausible-looking reference number per channel (purely cosmetic). */
function buildTradeNo(method: PaymentMethodValue, at: Date): string {
  const stamp = at.getTime().toString().slice(-9);
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");

  switch (method) {
    // WeChat transaction ids conventionally start with 42000.
    case "WECHAT":
      return `42000${stamp}${random}`;
    case "ALIPAY":
      return `${at.toISOString().slice(0, 10).replace(/-/g, "")}${stamp}${random}`;
    case "CARD":
    default:
      return `CARD${stamp}${random}`;
  }
}

/** Trip totals for the Trips page summary strip. */
export async function getBookingStats(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { userId },
    select: { status: true, totalPrice: true, checkIn: true, nights: true },
  });

  const today = todayUtc();
  const active = bookings.filter((b) => b.status === "CONFIRMED");

  // Refund totals, so Trips can surface "退款处理中 ¥X".
  const refunds = await prisma.refund.findMany({
    where: { booking: { userId } },
    select: { amount: true, status: true },
  });

  return {
    total: bookings.length,
    /** Awaiting checkout — surfaced as a "去支付" call to action. */
    pending: bookings.filter((b) => b.status === "PENDING").length,
    upcoming: active.filter((b) => b.checkIn.getTime() >= today.getTime()).length,
    completed: active.filter((b) => b.checkIn.getTime() < today.getTime()).length,
    totalSpend: active.reduce((sum, b) => sum + b.totalPrice, 0),
    totalNights: active.reduce((sum, b) => sum + b.nights, 0),
    /** Refund amount still in flight at the payment channel. */
    refunding: refunds
      .filter((refund) => refund.status === "PROCESSING")
      .reduce((sum, refund) => sum + refund.amount, 0),
    /** Refund amount the channel has already returned. */
    refunded: refunds
      .filter((refund) => refund.status === "SUCCEEDED")
      .reduce((sum, refund) => sum + refund.amount, 0),
  };
}
