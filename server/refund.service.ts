/**
 * Refund service.
 *
 * A refund is created by `cancelBooking` (inside the same transaction as the
 * status change); this module reads them and, for the demo, lets the channel
 * settlement be simulated.
 */
import { prisma } from "../lib/db";
import { conflict, forbidden, notFound } from "../lib/http";
import type { RefundDto } from "../types";
import { mapRefundRow, REFUND_SELECT } from "./booking.service";

/**
 * Load one refund, verifying it belongs to the caller.
 * Ownership is resolved through the parent booking, so a forged refund id
 * cannot be used to read someone else's data.
 */
async function assertOwnedRefund(userId: string, refundId: string) {
  const row = await prisma.refund.findUnique({
    where: { id: refundId },
    select: { ...REFUND_SELECT, booking: { select: { userId: true, id: true } } },
  });
  if (!row) throw notFound("退款记录不存在");
  if (row.booking.userId !== userId) throw forbidden("无权查看该退款记录");
  return row;
}

export async function getRefund(userId: string, refundId: string): Promise<RefundDto> {
  const row = await assertOwnedRefund(userId, refundId);
  return mapRefundRow(row);
}

/** All refunds for the signed-in user, newest first. */
export async function listRefunds(userId: string): Promise<RefundDto[]> {
  const rows = await prisma.refund.findMany({
    where: { booking: { userId } },
    select: REFUND_SELECT,
    orderBy: { requestedAt: "desc" },
  });
  return rows.map(mapRefundRow);
}

/**
 * Simulated channel settlement.
 *
 * Real refunds settle asynchronously over 1-3 business days; the demo exposes
 * this so the PROCESSING -> SUCCEEDED transition is demonstrable. No money
 * moves anywhere.
 */
export async function settleRefund(userId: string, refundId: string): Promise<RefundDto> {
  const row = await assertOwnedRefund(userId, refundId);

  if (row.status === "SUCCEEDED") throw conflict("该退款已完成到账");
  if (row.status === "FAILED") throw conflict("该退款已失败，请重新发起取消申请");

  const updated = await prisma.refund.update({
    where: { id: refundId },
    data: { status: "SUCCEEDED", completedAt: new Date() },
    select: REFUND_SELECT,
  });

  return mapRefundRow(updated);
}
