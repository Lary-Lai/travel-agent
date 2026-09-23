import type { NextRequest } from "next/server";

import { setSessionCookie } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { registerSchema } from "@/lib/validators";
import { registerUser } from "@/server/user.service";

/** POST /api/auth/register — create an account and sign in immediately. */
export const POST = handler(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const input = registerSchema.parse(body);

  const user = await registerUser(input);
  await setSessionCookie(user.id);

  return ok({ user }, { status: 201 });
});
