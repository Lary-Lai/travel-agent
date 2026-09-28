/**
 * Booking service.
 *
 * Price and availability are ALWAYS recomputed here from the listing row —
 * client-supplied totals are ignored, so the stored order cannot be tampered
 * with. No real payment is processed (per the brief).
 */
import { prisma } from "../lib/db";
import { formatDate, parseDateOnly, todayUtc } from "../lib/format";
import { FALLBACK_LOCALE } from "../lib/i18n/locales";
import { badRequest, conflict, forbidden, notFound } from "../lib/http";
import { PAYMENT_WINDOW_MS } from "../lib/payment";
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

/**
 * How long a PENDING hold survives before it is auto-cancelled.
 *
 * The value itself lives in `lib/payment.ts` so the checkout can count down to
 * the same instant without importing this module (and therefore Prisma) into the
 * browser bundle. Re-exported here because this is where callers look for it.
 */
export { PAYMENT_WINDOW_MINUTES, PAYMENT_WINDOW_MS } from "@/lib/payment";

/** The deadline a booking created now would get. */
export function paymentDueAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + PAYMENT_WINDOW_MS);
}
/**
 * Which bookings still block their dates.
 *
 * A PENDING booking only holds dates while its payment window is open. Without
 * the `paymentDueAt` condition an abandoned checkout would block the listing for
 * every future guest — which is exactly the bug this feature fixes. CONFIRMED
 * bookings block indefinitely.
 */
function blockingHolds(now: Date) {
  return [
    { status: "CONFIRMED" as const },
    { status: "PENDING" as const, paymentDueAt: { gt: now } },
  ];
}

/**
 * Cancel PENDING bookings whose payment window has closed.
 *
 * Called lazily on read rather than from a cron job: the project has no
 * scheduler, and the only moment the answer matters is when someone looks. It is
 * scoped to one user on the user-facing paths so a request never sweeps the
 * whole table; pass no user id for a full sweep.
 */
export async function expireStaleBookings(userId?: string): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: {
      ...(userId ? { userId } : {}),
      status: "PENDING",
      paidAt: null,
      paymentDueAt: { lte: new Date() },
    },
    data: { status: "CANCELLED" },
  });
  return result.count;
}

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
    paymentDueAt: row.paymentDueAt ? row.paymentDueAt.toISOString() : null,
    // Computed here so the UI never has to decide what "expired" means, and so
    // the checkout and the server can never disagree about the deadline.
    paymentExpired:
      row.status === "PENDING" &&
      row.paidAt === null &&
      row.paymentDueAt !== null &&
      row.paymentDueAt.getTime() <= Date.now(),
    // Deliberately independent of status: the moment the sweeper cancels a hold
    // `paymentExpired` turns false, which is exactly when the UI most needs to
    // explain that the deadline, not the guest, ended the order.
    paymentTimedOut:
      row.paidAt === null &&
      row.paymentDueAt !== null &&
      row.paymentDueAt.getTime() <= Date.now(),
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
      OR: blockingHolds(new Date()),
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { checkIn: true, checkOut: true },
  });
  if (clash) {
    // Chinese deliberately: server errors carry no locale (the request's locale
    // is only known to the UI layer), and this one is shown verbatim when the
    // client cannot map it to a translated message.
    throw conflict(
      `该房源在 ${formatDate(clash.checkIn, FALLBACK_LOCALE)} – ${formatDate(clash.checkOut, FALLBACK_LOCALE)} 已被预订，请选择其他日期`,
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
      // Held, not confirmed: the dates are blocked until checkout is paid,
      // and only for as long as the payment window stays open.
      status: "PENDING",
      paymentDueAt: paymentDueAt(),
    },
    include: BOOKING_INCLUDE,
  });

  return mapBooking(row);
}

export async function listBookings(userId: string): Promise<BookingDto[]> {
  await expireStaleBookings(userId);
  const rows = await prisma.booking.findMany({
    where: { userId, archivedAt: null },
    include: BOOKING_INCLUDE,
    // Upcoming trips first, then most recently booked.
    orderBy: [{ checkIn: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(mapBooking);
}

export async function getBooking(userId: string, bookingId: string): Promise<BookingDto> {
  await expireStaleBookings(userId);
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
  // A paid booking is a duplicate-payment question regardless of its deadline,
  // so that check stays first.
  if (row.paidAt) throw conflict("该订单已完成支付，请勿重复支付");

  // Deadline before the generic CANCELLED check: by the time a late payer gets
  // here the sweeper has usually already flipped the row, so testing status
  // first would report "this order was cancelled" and hide the actual reason.
  if (row.paymentDueAt && row.paymentDueAt.getTime() <= Date.now()) {
    if (row.status !== "CANCELLED") {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: "CANCELLED" },
      });
    }
    throw conflict("支付时限已过，订单已自动取消，请重新预订");
  }

  if (row.status === "CANCELLED") throw conflict("该订单已取消，无法支付");

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
  await expireStaleBookings(userId);
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

/**
 * Hide a finished booking from the user's list.
 *
 * Deliberately not a hard delete: `Refund` rows cascade from `Booking`, so
 * deleting the booking would delete the refund record too. Archiving keeps the
 * financial trail intact and only removes it from `/trips`.
 *
 * Only CANCELLED bookings qualify. Archiving a PENDING or CONFIRMED one would
 * release its dates without running cancellation — the user would lose money
 * owed to them (or owe money) with no record of why.
 */
export async function archiveBooking(userId: string, bookingId: string): Promise<void> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    select: { id: true, status: true, archivedAt: true },
  });
  if (!booking) throw notFound("订单不存在");
  if (booking.archivedAt) throw conflict("该订单已经删除");

  if (booking.status !== "CANCELLED") {
    throw badRequest("只能删除已取消的订单；进行中的订单请先取消");
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { archivedAt: new Date() },
  });
}

/** Clear every cancelled booking at once. Returns how many were hidden. */
export async function archiveCancelledBookings(userId: string): Promise<number> {
  const result = await prisma.booking.updateMany({
    where: { userId, archivedAt: null, status: "CANCELLED" },
    data: { archivedAt: new Date() },
  });
  return result.count;
}
