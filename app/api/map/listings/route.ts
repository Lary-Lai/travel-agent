import { handler, ok } from "@/lib/http";
import { getMapOverview } from "@/server/plan.service";

/**
 * GET /api/map/listings
 *
 * Every city and every listing coordinate, for the trip planner's map. Public: the
 * listings are public data, and the planner is useful before signing in.
 */
export const GET = handler(async () => {
  const overview = await getMapOverview();
  return ok(overview);
});
