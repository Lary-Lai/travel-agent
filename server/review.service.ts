/**
 * Guest reviews.
 *
 * Persistence is the point of this feature: reviews live in the `Review` table
 * keyed by user id, so they are still there on the next login and on another
 * device. One row per (listing, user) — a guest edits their own review instead
 * of stacking duplicates, which keeps the average honest and makes "my review"
 * a single indexed lookup.
 */
import { prisma } from "../lib/db";
import { badRequest, forbidden, notFound } from "../lib/http";
import type { ReviewDto, ReviewSummary } from "../types";

const MAX_COMMENT = 600;
const MIN_COMMENT = 4;

const toDto = (
  review: {
    id: string;
    rating: number;
    comment: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    user: { id: string; name: string; avatar: string | null };
  },
  viewerId: string | null,
): ReviewDto => ({
  id: review.id,
  rating: review.rating,
  comment: review.comment,
  createdAt: review.createdAt.toISOString(),
  updatedAt: review.updatedAt.toISOString(),
  isMine: viewerId !== null && review.userId === viewerId,
  author: {
    id: review.user.id,
    name: review.user.name,
    avatar: review.user.avatar,
  },
});

const reviewSelect = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  user: { select: { id: true, name: true, avatar: true } },
} as const;

/**
 * Every review for a listing, plus the aggregate and the caller's own review.
 *
 * `viewerId` is optional so the section works for signed-out visitors too — they
 * can read reviews, they just cannot write one.
 */
export async function getListingReviews(
  listingId: string,
  viewerId: string | null,
  limit = 50,
): Promise<ReviewSummary> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { rating: true, reviewCount: true },
  });
  if (!listing) throw notFound("房源不存在");

  const [reviews, stored, myReviewRaw] = await Promise.all([
    prisma.review.findMany({
      where: { listingId },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      select: reviewSelect,
    }),
    // The histogram needs every rating, not just the page we display.
    prisma.review.findMany({ where: { listingId }, select: { rating: true } }),
    viewerId
      ? prisma.review.findUnique({
          where: { listingId_userId: { listingId, userId: viewerId } },
          select: reviewSelect,
        })
      : Promise.resolve(null),
  ]);

  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: stored.filter((review) => review.rating === stars).length,
  }));

  const average =
    stored.length > 0
      ? Number((stored.reduce((sum, r) => sum + r.rating, 0) / stored.length).toFixed(2))
      : null;

  return {
    average,
    count: stored.length,
    distribution,
    reviews: reviews.map((review) => toDto(review, viewerId)),
    myReview: myReviewRaw ? toDto(myReviewRaw, viewerId) : null,
    // The listing row carries an aggregate from the seed (historical reviews that
    // have no individual rows). Surfaced separately rather than mixed in, so the
    // numbers the UI shows are traceable.
    seededCount: listing.reviewCount,
    seededRating: listing.rating,
  };
}

/** Create or update the caller's review of a listing. */
export async function saveReview(
  userId: string,
  listingId: string,
  input: { rating: number; comment: string },
): Promise<ReviewDto> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, hostId: true },
  });
  if (!listing) throw notFound("房源不存在");

  // Hosts reviewing their own place is a credibility hole, not a feature.
  if (listing.hostId === userId) {
    throw forbidden("不能评价自己发布的房源");
  }

  const rating = Math.round(input.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw badRequest("评分需要在 1 到 5 之间");
  }

  const comment = input.comment.trim();
  if (comment.length < MIN_COMMENT) throw badRequest(`评论至少 ${MIN_COMMENT} 个字`);
  if (comment.length > MAX_COMMENT) throw badRequest(`评论不能超过 ${MAX_COMMENT} 个字`);

  const review = await prisma.review.upsert({
    where: { listingId_userId: { listingId, userId } },
    create: { listingId, userId, rating, comment },
    update: { rating, comment },
    select: reviewSelect,
  });

  return toDto(review, userId);
}

/** Remove the caller's own review. Deleting someone else's is impossible here. */
export async function deleteReview(userId: string, listingId: string): Promise<void> {
  const existing = await prisma.review.findUnique({
    where: { listingId_userId: { listingId, userId } },
    select: { id: true },
  });
  if (!existing) throw notFound("你还没有评价过这套房源");

  await prisma.review.delete({ where: { id: existing.id } });
}
