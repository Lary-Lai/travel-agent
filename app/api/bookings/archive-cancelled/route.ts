import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { archiveCancelledBookings } from "@/server/booking.service";

/**
 * POST /api/bookings/archive-cancelled
 *
 * Clears every cancelled booking from the signed-in user's list in one go.
 * Returns how many were hidden so the UI can report a real number instead of
 * assuming it worked.
 */
export const POST = handler(async () => {
  const user = await requireUser();
  const count = await archiveCancelledBookings(user.id);
  return ok({ count });
});
