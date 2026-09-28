import type { NextRequest } from "next/server";

import { getCurrentUser, requireUser } from "@/lib/auth";
import { handler, ok } from "@/lib/http";
import { saveReviewSchema } from "@/lib/validators";
import { deleteReview, getListingReviews, saveReview } from "@/server/review.service";

/**
 * GET    /api/listings/[id]/reviews   -> reviews + aggregate (public)
 * POST   /api/listings/[id]/reviews   -> create or update MY review (auth)
 * DELETE /api/listings/[id]/reviews   -> remove MY review (auth)
 *
 * Reading is public so signed-out visitors can still see what people said; only
 * writing requires a session. The author always comes from the session cookie,
 * never from the body, so nobody can post as someone else.
 */
type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: NextRequest, context: Context) => {
  const { id } = await context.params;
  const viewer = await getCurrentUser();
  const summary = await getListingReviews(id, viewer?.id ?? null);
  return ok(summary);
});

export const POST = handler(async (request: NextRequest, context: Context) => {
  const { id } = await context.params;
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const input = saveReviewSchema.parse(body);

  const review = await saveReview(user.id, id, input);
  const summary = await getListingReviews(id, user.id);
  return ok({ review, summary }, { status: 201 });
});

export const DELETE = handler(async (_request: NextRequest, context: Context) => {
  const { id } = await context.params;
  const user = await requireUser();

  await deleteReview(user.id, id);
  // Return the recomputed summary so the client can re-render without a refetch.
  const summary = await getListingReviews(id, user.id);
  return ok({ summary });
});
