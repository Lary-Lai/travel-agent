import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { settleRefund } from "@/server/refund.service";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/refunds/:id/settle
 *
 * Simulated channel settlement: PROCESSING -> SUCCEEDED.
 *
 * Real refunds settle asynchronously over 1-3 business days; the demo exposes
 * this transition explicitly so the refund lifecycle is demonstrable. No money
 * moves anywhere. Owner-only, resolved through the parent booking.
 */
export const POST = handler(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;

  const refund = await settleRefund(user.id, id);
  return ok({ refund });
});
