import type { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { searchUsers } from "@/server/social.service";

/**
 * A search term, capped rather than rejected for length alone: the picker sends
 * whatever is in the box, and a longer string simply cannot match a name.
 */
const searchSchema = z.object({
  q: z.string().trim().max(80, "搜索关键词过长").default(""),
});

/**
 * GET /api/users/search?q=
 *
 * People picker for the visibility dialog. Signed in only: the result is a slice
 * of the user directory, and the exclusions (yourself, both directions of a
 * block) are derived from the caller's own session.
 */
export const GET = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const { q } = searchSchema.parse({ q: request.nextUrl.searchParams.get("q") ?? "" });

  return ok({ users: await searchUsers(user.id, q) });
});
