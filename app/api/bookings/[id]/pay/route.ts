import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { payBookingSchema } from "@/lib/validators";
import { payBooking } from "@/server/booking.service";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/bookings/:id/pay
 *
 * Simulated checkout — no real payment gateway is involved. Records the chosen
 * channel and moves the booking from PENDING to CONFIRMED.
 *
 * Owner-only: the user id comes from the session cookie, and the service
 * re-checks ownership, cancellability and double-payment.
 */
export const POST = handler(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { method } = payBookingSchema.parse(body);

  const booking = await payBooking(user.id, id, method);
  return ok({ booking });
});
