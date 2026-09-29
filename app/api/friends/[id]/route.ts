import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { removeFriendship, respondToFriendRequest } from "@/server/social.service";

const respondSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/friends/:id — accept or decline a request.
 *
 * `:id` is the friendship row's id, which the caller may have obtained from
 * someone else's payload; the service therefore re-checks that the session user
 * is the addressee before anything happens and answers 403 otherwise.
 */
export const POST = handler(async (request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const { action } = respondSchema.parse(body);

  return ok({ friend: await respondToFriendRequest(user.id, id, action) });
});

/**
 * DELETE /api/friends/:id — cancel a request you sent, or unfriend someone.
 *
 * Both gestures delete the same row and both are allowed for either party, so
 * they share one endpoint. The caller's participation is re-derived from the row
 * (403 for a stranger) because the id alone proves nothing.
 */
export const DELETE = handler(async (_request: NextRequest, context: Context) => {
  const user = await requireUser();
  const { id } = await context.params;

  const removed = await removeFriendship(user.id, id);
  return ok({ removed });
});
