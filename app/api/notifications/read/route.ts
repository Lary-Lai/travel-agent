import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { markRead } from "@/server/notification.service";

/**
 * POST /api/notifications/read
 *
 * Body `{ id }` marks one as read; an empty body marks them all. Kept separate
 * from the list route so that merely opening the inbox is not a mutation — the
 * client decides when the user has actually seen things.
 *
 * `userId` is part of the update's `where` in the service, so a guessed id cannot
 * mark another account's notification as read.
 */
export const POST = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" && body.id.length > 0 ? body.id : undefined;

  const unreadCount = await markRead(user.id, id);
  return ok({ unreadCount });
});
