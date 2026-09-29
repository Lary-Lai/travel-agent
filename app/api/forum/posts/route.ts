import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser, requireUser } from "@/lib/auth";
import { badRequest, handler, ok } from "@/lib/http";
import { createPost, listPosts } from "@/server/forum.service";
import { FORUM_SORTS, type ForumSortValue } from "@/types";

/** Unknown or missing sort falls back to "latest" rather than 400: the sort is a
 *  view preference, and a stale bookmark should still render a list. */
function parseSort(value: string | null): ForumSortValue {
  return (FORUM_SORTS as readonly string[]).includes(value ?? "")
    ? (value as ForumSortValue)
    : "latest";
}

/**
 * GET /api/forum/posts?board=&sort=&q=&city=&mine=
 *
 * Public. `viewerId` is resolved only so each row can say `isMine` and the UI can
 * offer a delete button; it never widens what is returned.
 */
export const GET = handler(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const viewer = await getCurrentUser();

  const result = await listPosts({
    board: params.get("board"),
    sort: parseSort(params.get("sort")),
    q: params.get("q"),
    city: params.get("city"),
    mine: params.get("mine") === "1" || params.get("mine") === "true",
    viewerId: viewer?.id ?? null,
  });

  return ok(result);
});

/** Declared here rather than in `lib/validators.ts`, which this workstream does
 *  not own. The service re-checks every rule, so a second caller cannot skip it. */
const createPostSchema = z.object({
  boardSlug: z.string().min(1, "请选择板块"),
  title: z.string().min(1, "标题不能为空").max(120, "标题不能超过 120 个字"),
  body: z.string().min(1, "正文不能为空").max(5000, "正文不能超过 5000 个字"),
  city: z.string().max(80).optional().nullable(),
});

/**
 * POST /api/forum/posts — publish a post (auth required).
 *
 * The author comes from the session cookie, never from the body, so nobody can
 * post as somebody else.
 */
export const POST = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const parsed = createPostSchema.safeParse(body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "请求参数不合法");

  const post = await createPost(user.id, parsed.data);
  return ok({ post }, { status: 201 });
});
