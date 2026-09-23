/**
 * Cancellation policy and refund calculation.
 *
 * Single source of truth, shared by the UI (to quote a refund before the user
 * confirms) and by the Booking service (to record it). The same reason we share
 * `lib/pricing.ts`: the number shown must equal the number stored.
 *
 * Policy (measured in whole days before check-in):
 *
 *   >= 7 days   full refund            room 100% + cleaning 100% + service 100%
 *   3-6 days    partial refund         room  50% + cleaning 100% + service   0%
 *   <= 2 days   no refund              nothing is returned
 *
 * Cleaning is refunded in full until the last moment because the service is
 * simply not performed; the platform service fee is non-refundable, which is
 * how most real booking sites structure it.
 */
import { parseDateOnly } from "./format";

export const FREE_CANCELLATION_DAYS = 7;
export const PARTIAL_REFUND_DAYS = 3;
export const PARTIAL_ROOM_REFUND_RATE = 0.5;

export type RefundTier =
  | "FREE"
  | "PARTIAL"
  | "NONE"
  /** Nothing was ever paid, so cancelling simply releases the dates. */
  | "NOT_PAID"
  /** The order is already cancelled — a second refund is impossible. */
  | "ALREADY_CANCELLED";

export const REFUND_TIER_LABELS: Record<RefundTier, string> = {
  FREE: "免费取消",
  PARTIAL: "部分退款",
  NONE: "不可退款",
  NOT_PAID: "未支付",
  ALREADY_CANCELLED: "已取消",
};

export type RefundQuote = {
  tier: RefundTier;
  tierLabel: string;
  /** Whole days from today until check-in; negative once the stay has begun. */
  daysUntilCheckIn: number;
  roomRefund: number;
  cleaningRefund: number;
  serviceRefund: number;
  /** Total that will be returned to the original payment channel. */
  amount: number;
  /** What the guest actually paid, for the "退 X / 共 Y" display. */
  totalPaid: number;
  refundable: boolean;
  /** One-line explanation suitable for a dialog. */
  description: string;
};

export type RefundQuoteInput = {
  totalPrice: number;
  roomPrice: number;
  cleaningFee: number;
  serviceFee: number;
  checkIn: string | Date;
  isPaid: boolean;
  cancelled?: boolean;
};

/** Whole days between today (local) and the check-in date. */
export function daysUntilCheckIn(checkIn: string | Date, now: Date = new Date()): number {
  const checkInDay = parseDateOnly(checkIn).getTime();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((checkInDay - today) / 86_400_000);
}

/** Rows for the policy table shown in the UI. */
export const POLICY_TABLE: Array<{ window: string; room: string; cleaning: string; service: string }> = [
  { window: `入住前 ${FREE_CANCELLATION_DAYS} 天及以上`, room: "全额", cleaning: "全额", service: "全额" },
  { window: `入住前 ${PARTIAL_REFUND_DAYS}-${FREE_CANCELLATION_DAYS - 1} 天`, room: "50%", cleaning: "全额", service: "不退" },
  { window: `入住前 ${PARTIAL_REFUND_DAYS - 1} 天及以内`, room: "不退", cleaning: "不退", service: "不退" },
];

export function calculateRefundQuote(
  input: RefundQuoteInput,
  now: Date = new Date(),
): RefundQuote {
  const days = daysUntilCheckIn(input.checkIn, now);

  const base = {
    daysUntilCheckIn: days,
    totalPaid: input.isPaid ? input.totalPrice : 0,
    roomRefund: 0,
    cleaningRefund: 0,
    serviceRefund: 0,
    amount: 0,
  };

  if (input.cancelled) {
    return {
      ...base,
      tier: "ALREADY_CANCELLED",
      tierLabel: REFUND_TIER_LABELS.ALREADY_CANCELLED,
      totalPaid: input.isPaid ? input.totalPrice : 0,
      refundable: false,
      description: "该订单已取消。",
    };
  }

  if (!input.isPaid) {
    return {
      ...base,
      tier: "NOT_PAID",
      tierLabel: REFUND_TIER_LABELS.NOT_PAID,
      refundable: false,
      description: "该订单尚未支付，取消后无需退款，房源日期会立即释放。",
    };
  }

  // ---- free cancellation window
  if (days >= FREE_CANCELLATION_DAYS) {
    return {
      ...base,
      tier: "FREE",
      tierLabel: REFUND_TIER_LABELS.FREE,
      roomRefund: input.roomPrice,
      cleaningRefund: input.cleaningFee,
      serviceRefund: input.serviceFee,
      amount: input.roomPrice + input.cleaningFee + input.serviceFee,
      refundable: true,
      description: `距离入住还有 ${days} 天，处于免费取消期内，可全额退款。`,
    };
  }

  // ---- partial window
  if (days >= PARTIAL_REFUND_DAYS) {
    const roomRefund = Math.round(input.roomPrice * PARTIAL_ROOM_REFUND_RATE);
    const cleaningRefund = input.cleaningFee;
    return {
      ...base,
      tier: "PARTIAL",
      tierLabel: REFUND_TIER_LABELS.PARTIAL,
      roomRefund,
      cleaningRefund,
      serviceRefund: 0,
      amount: roomRefund + cleaningRefund,
      refundable: roomRefund + cleaningRefund > 0,
      description: `距离入住还有 ${days} 天，可退还 50% 房费与全额清洁费，服务费不退。`,
    };
  }

  // ---- no-refund window
  return {
    ...base,
    tier: "NONE",
    tierLabel: REFUND_TIER_LABELS.NONE,
    refundable: false,
    description:
      days < 0
        ? "入住日期已开始或已结束，按政策无法退款。"
        : `距离入住仅剩 ${days} 天，已超过免费取消期，按政策无法退款。`,
  };
}

/** Plausible channel refund reference (cosmetic). */
export function buildRefundTradeNo(at: Date = new Date()): string {
  const stamp = at.getTime().toString().slice(-9);
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `RF${stamp}${random}`;
}
