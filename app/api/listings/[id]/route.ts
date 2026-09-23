import { handler, ok } from "@/lib/http";
import { getListingDetail } from "@/server/listing.service";

/** Next 16: dynamic route params are async and must be awaited. */
type Context = { params: Promise<{ id: string }> };

/** GET /api/listings/:id — public listing detail. */
export const GET = handler(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  const listing = await getListingDetail(id);
  return ok(listing);
});
