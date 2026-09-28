import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { archiveBooking } from "@/server/booking.service";

/**
 * POST /api/bookings/[id]/archive
 *
 * Hides a finished booking from the signed-in user's list.
 *
 * A separate route rather than `DELETE /api/bookings/[id]`, because that one
 * already means "cancel this booking" and carries a refund quote with it. Two
 * different operations with different consequences should not share a verb.
 */
type Context = { params: Promise<{ id: string }> };

export const POST = handler(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;

  await archiveBooking(user.id, id);
  return ok({ archived: true });
});
