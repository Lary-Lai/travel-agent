import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { changeEmailSchema } from "@/lib/validators";
import { changeEmail } from "@/server/user.service";

/**
 * POST /api/users/me/email
 *
 * Change the signed-in user's sign-in address. The current password is required,
 * so a stolen session cookie alone cannot move the account to an address the
 * attacker controls — which would lock the real owner out silently.
 *
 * Returns the updated user, because the address is shown in the header, the
 * profile page and the account form, and making the client refetch just to learn
 * it would leave those three briefly disagreeing.
 */
export const POST = handler(async (request: NextRequest) => {
  const current = await requireUser();
  const body = await request.json().catch(() => ({}));
  const { email, currentPassword } = changeEmailSchema.parse(body);

  const user = await changeEmail(current.id, currentPassword, email);
  return ok({ user });
});
