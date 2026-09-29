import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { getPublicProfile } from "@/server/social.service";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/users/:id — another person's profile.
 *
 * Deliberately NOT `requireUser`: a signed-out visitor may open a PUBLIC
 * profile, so the viewer id is optional and the service decides what that
 * viewer may see.
 *
 * A hidden profile is still a 200 with `canView: false` and the reason, not a
 * 403 — the page has to explain itself, and "forbidden" would render as an error
 * state rather than "this profile is private".
 */
export const GET = handler(async (_request: NextRequest, context: Context) => {
  const { id } = await context.params;
  const viewer = await getCurrentUser();

  return ok(await getPublicProfile(id, viewer?.id ?? null));
});
