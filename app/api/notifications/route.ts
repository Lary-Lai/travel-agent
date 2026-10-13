import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { listNotifications } from "@/server/notification.service";

/**
 * GET /api/notifications
 *
 * The list and the badge count together: the header renders both, and fetching
 * them separately would let the badge disagree with the list it labels. Reading is
 * not a mutation — marking as read is `POST /api/notifications/read`, so opening
 * the inbox does not silently clear it.
 */
export const GET = handler(async () => {
  const user = await requireUser();
  const { items, unreadCount } = await listNotifications(user.id);
  return ok({ items, unreadCount });
});
