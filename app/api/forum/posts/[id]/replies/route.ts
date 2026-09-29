import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { badRequest, handler, ok } from "@/lib/http";
import { createReply } from "@/server/forum.service";

type Context = { params: Promise<{ id: string }> };

/** Local to this route; `lib/validators.ts` belongs to another workstream. The
 *  service validates again, so the rule holds for any caller. */
const createReplySchema = z.object({
  body: z.string().min(1, "回复不能为空").max(2000, "回复不能超过 2000 个字"),
});

/**
 * POST /api/forum/posts/[id]/replies — reply to a post (auth required).
 *
 * Returns the created reply *and* the post's new `replyCount`, so the caller can
 * patch the list row it already has instead of refetching the whole thread.
 */
export const POST = handler(async (request: NextRequest, context: Context) => {
  const { id } = await context.params;
  const user = await requireUser();
  const payload = await request.json().catch(() => ({}));
  const parsed = createReplySchema.safeParse(payload);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "请求参数不合法");

  const result = await createReply(user.id, id, parsed.data.body);
  return ok(result, { status: 201 });
});
