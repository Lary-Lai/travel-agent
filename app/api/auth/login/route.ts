import type { NextRequest } from "next/server";

import { setSessionCookie } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { loginSchema } from "@/lib/validators";
import { verifyCredentials } from "@/server/user.service";

/** POST /api/auth/login — exchange credentials for an HttpOnly session cookie. */
export const POST = handler(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const { email, password } = loginSchema.parse(body);

  const user = await verifyCredentials(email, password);
  await setSessionCookie(user.id);

  return ok({ user });
});
