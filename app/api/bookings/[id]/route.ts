import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { cancelBooking, getBooking } from "@/server/booking.service";

type Context = { params: Promise<{ id: string }> };

/** GET /api/bookings/:id — one trip. Owner only. */
export const GET = handler(async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const booking = await getBooking(user.id, id);
  return ok({ booking });
});

/** DELETE /api/bookings/:id — cancel a trip. Owner only. */
export const DELETE = handler(async (_request: Request, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const booking = await cancelBooking(user.id, id);
  return ok({ booking });
});
