import type { NextRequest } from "next/server";

import { getCurrentUser, requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { deletePost, getPost } from "@/server/forum.service";

type Context = { params: Promise<{ id: string }> };

/** GET /api/forum/posts/[id] — the post plus its replies (public). */
export const GET = handler(async (_request: NextRequest, context: Context) => {
  const { id } = await context.params;
  const viewer = await getCurrentUser();
  const payload = await getPost(id, viewer?.id ?? null);
  return ok(payload);
});

/** DELETE /api/forum/posts/[id] — remove my own post (auth, author only). */
export const DELETE = handler(async (_request: NextRequest, context: Context) => {
  const { id } = await context.params;
  const user = await requireUser();
  await deletePost(user.id, id);
  return ok({ deleted: true });
});
