import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { createBookingSchema } from "@/lib/validators";
import { createBooking, getBookingStats, listBookings } from "@/server/booking.service";

/** GET /api/bookings — the signed-in user's trips. */
export const GET = handler(async () => {
  const user = await requireUser();
  const [bookings, stats] = await Promise.all([listBookings(user.id), getBookingStats(user.id)]);
  return ok({ bookings, stats });
});

/**
 * POST /api/bookings — create a trip.
 * Price is recalculated server-side from the listing; client totals are ignored.
 */
export const POST = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const input = createBookingSchema.parse(body);

  const booking = await createBooking(user.id, input);
  return ok({ booking }, { status: 201 });
});
