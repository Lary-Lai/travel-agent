import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { changePasswordSchema } from "@/lib/validators";
import { changePassword } from "@/server/user.service";

/**
 * POST /api/users/me/password
 *
 * Change the signed-in user's password. The current password is required, so a
 * stolen session cookie alone cannot take over the account.
 */
export const POST = handler(async (request: NextRequest) => {
  const current = await requireUser();
  const body = await request.json().catch(() => ({}));
  const { currentPassword, newPassword } = changePasswordSchema.parse(body);

  await changePassword(current.id, currentPassword, newPassword);
  return ok({ updated: true });
});
