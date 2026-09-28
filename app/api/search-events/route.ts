import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { recordSearchSchema } from "@/lib/validators";
import { recordSearch } from "@/server/personalization.service";

/**
 * POST /api/search-events
 *
 * Records a search for personalising recommendations.
 *
 * Deliberately a signed-out no-op rather than a 401: the caller is a background
 * recorder on the search page, and a hard error there would surface as a console
 * failure on every anonymous search. Nothing about *where* the user wants to go
 * can be personalised without an account, so dropping it is the honest outcome.
 *
 * Recording happens here (an explicit POST) rather than during the search page's
 * render, so a page render never writes to the database.
 */
export const POST = handler(async (request: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) return ok({ recorded: false, reason: "signed-out" });

  const body = await request.json().catch(() => ({}));
  const input = recordSearchSchema.parse(body);

  await recordSearch(user.id, input);
  return ok({ recorded: true });
});
