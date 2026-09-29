import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { listFriends, sendFriendRequest } from "@/server/social.service";

const sendRequestSchema = z.object({
  userId: z.string().trim().min(1, "缺少用户 id"),
});

/**
 * GET /api/friends — the caller's own friends and pending requests.
 *
 * "Own" is not a parameter: the list is built from the session, so there is no
 * user id to tamper with.
 */
export const GET = handler(async () => {
  const user = await requireUser();
  return ok(await listFriends(user.id));
});

/**
 * POST /api/friends — ask someone to be friends.
 *
 * The requester is the session user, so this can only ever send on your own
 * behalf. Sending to someone who already asked you accepts their request instead
 * (see the service) and answers with the accepted friendship.
 */
export const POST = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const { userId } = sendRequestSchema.parse(body);

  const friend = await sendFriendRequest(user.id, userId);
  return ok({ friend }, { status: 201 });
});
