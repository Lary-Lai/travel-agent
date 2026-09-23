import { getCurrentUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";

/**
 * GET /api/auth/session
 * Returns the current user or null. Never throws for a signed-out visitor —
 * the client uses this to hydrate auth state.
 */
export const GET = handler(async () => {
  const user = await getCurrentUser();
  return ok({ user });
});
