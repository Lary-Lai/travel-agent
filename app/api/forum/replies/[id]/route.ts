import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { deleteReply } from "@/server/forum.service";

type Context = { params: Promise<{ id: string }> };

/**
 * DELETE /api/forum/replies/[id] — remove my own reply (auth, author only).
 *
 * Deleting someone else's reply is a 403 from the service, not a silent no-op.
 */
export const DELETE = handler(async (_request: NextRequest, context: Context) => {
  const { id } = await context.params;
  const user = await requireUser();
  await deleteReply(user.id, id);
  return ok({ deleted: true });
});
