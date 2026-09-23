import { clearSessionCookie } from "@/lib/auth";
import { handler, ok } from "@/lib/http";

/** POST /api/auth/logout — clear the session cookie. */
export const POST = handler(async () => {
  await clearSessionCookie();
  return ok({ signedOut: true });
});
