import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { updateProfileSchema } from "@/lib/validators";
import { updateProfile } from "@/server/user.service";

/**
 * PATCH /api/users/me
 *
 * Update the signed-in user's display name and avatar. The user id comes from
 * the session cookie, so this can only ever modify the caller's own profile.
 */
export const PATCH = handler(async (request: NextRequest) => {
  const current = await requireUser();
  const body = await request.json().catch(() => ({}));
  const input = updateProfileSchema.parse(body);

  const user = await updateProfile(current.id, input);
  return ok({ user });
});
