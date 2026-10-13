import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { getPlan, putPlanItem, removePlanItem } from "@/server/plan.service";

/**
 * The traveller's itinerary.
 *
 *   GET    /api/plan?listingId=…   — the plan (one item, when filtered)
 *   POST   /api/plan               — put a listing on a day (or move it)
 *   DELETE /api/plan?listingId=…   — take it off the plan
 *
 * One route rather than three: a plan has no meaning apart from its owner, the payload
 * is tiny, and both the UI and the assistant need exactly these operations. `userId`
 * comes from the session and is passed to every service call, so no request can name
 * another account's plan.
 */

export const GET = handler(async () => {
  const user = await requireUser();
  const items = await getPlan(user.id);
  return ok({ items });
});

export const POST = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));

  const item = await putPlanItem(
    user.id,
    String(body?.listingId ?? ""),
    Number(body?.day ?? 1),
    typeof body?.note === "string" ? body.note : null,
  );

  // Returned with the whole plan: the assistant and the UI both need to know what the
  // day now looks like, and a second round trip to find out would be silly.
  return ok({ item, items: await getPlan(user.id) });
});

export const DELETE = handler(async (request: NextRequest) => {
  const user = await requireUser();
  const params = request.nextUrl.searchParams;

  const removed = await removePlanItem(user.id, {
    itemId: params.get("itemId") ?? undefined,
    listingId: params.get("listingId") ?? undefined,
  });

  return ok({ removed, items: await getPlan(user.id) });
});
