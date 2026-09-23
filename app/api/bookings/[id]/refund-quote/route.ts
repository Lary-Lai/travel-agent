import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { getRefundQuote } from "@/server/booking.service";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/bookings/:id/refund-quote
 *
 * Previews the refund a cancellation would produce, without cancelling.
 * The confirmation dialog uses this so the user sees the real policy outcome
 * (and the exact amount) before committing. Owner-only.
 */
export const GET = handler(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const quote = await getRefundQuote(user.id, id);
  return ok({ quote });
});
