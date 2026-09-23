/**
 * Wishlist service.
 *
 * Every function takes `userId` as its first argument and re-verifies ownership
 * in the database — the client can never act on another user's wishlist by
 * passing a forged id.
 */
import { prisma } from "../lib/db";
import { badRequest, conflict, forbidden, notFound } from "../lib/http";
import type { WishlistDto } from "../types";
import { Prisma } from "../lib/generated/prisma/client";
import { LISTING_INCLUDE, mapListingRow } from "./listing.service";

const WISHLIST_INCLUDE = {
  items: {
    orderBy: { createdAt: "desc" as const },
    include: { listing: { include: LISTING_INCLUDE } },
  },
} satisfies Prisma.WishlistInclude;

type WishlistRow = Prisma.WishlistGetPayload<{ include: typeof WISHLIST_INCLUDE }>;

function mapWishlist(row: WishlistRow): WishlistDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    itemCount: row.items.length,
    items: row.items.map((item) => ({
      id: item.id,
      listingId: item.listingId,
      addedAt: item.createdAt.toISOString(),
      listing: mapListingRow(item.listing),
    })),
  };
}

function normaliseName(name: string): string {
  const trimmed = name?.trim() ?? "";
  if (trimmed.length === 0) throw badRequest("心愿单名称不能为空");
  if (trimmed.length > 60) throw badRequest("心愿单名称不能超过 60 个字符");
  return trimmed;
}

/** Confirm the wishlist exists AND belongs to this user. */
async function assertOwnedWishlist(userId: string, wishlistId: string) {
  const wishlist = await prisma.wishlist.findUnique({
    where: { id: wishlistId },
    select: { id: true, userId: true, name: true },
  });
  if (!wishlist) throw notFound("心愿单不存在");
  if (wishlist.userId !== userId) throw forbidden("无权访问该心愿单");
  return wishlist;
}

export async function listWishlists(userId: string): Promise<WishlistDto[]> {
  const rows = await prisma.wishlist.findMany({
    where: { userId },
    include: WISHLIST_INCLUDE,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapWishlist);
}

export async function getWishlist(userId: string, wishlistId: string): Promise<WishlistDto> {
  await assertOwnedWishlist(userId, wishlistId);
  const row = await prisma.wishlist.findUniqueOrThrow({
    where: { id: wishlistId },
    include: WISHLIST_INCLUDE,
  });
  return mapWishlist(row);
}

export async function createWishlist(userId: string, name: string): Promise<WishlistDto> {
  const clean = normaliseName(name);

  const existing = await prisma.wishlist.findUnique({
    where: { userId_name: { userId, name: clean } },
    select: { id: true },
  });
  if (existing) throw conflict(`已存在名为「${clean}」的心愿单`);

  const row = await prisma.wishlist.create({
    data: { userId, name: clean },
    include: WISHLIST_INCLUDE,
  });
  return mapWishlist(row);
}

export async function renameWishlist(
  userId: string,
  wishlistId: string,
  name: string,
): Promise<WishlistDto> {
  await assertOwnedWishlist(userId, wishlistId);
  const clean = normaliseName(name);

  const clash = await prisma.wishlist.findFirst({
    where: { userId, name: clean, NOT: { id: wishlistId } },
    select: { id: true },
  });
  if (clash) throw conflict(`已存在名为「${clean}」的心愿单`);

  const row = await prisma.wishlist.update({
    where: { id: wishlistId },
    data: { name: clean },
    include: WISHLIST_INCLUDE,
  });
  return mapWishlist(row);
}

export async function deleteWishlist(userId: string, wishlistId: string): Promise<void> {
  await assertOwnedWishlist(userId, wishlistId);
  // WishlistItem rows cascade via the schema's onDelete: Cascade.
  await prisma.wishlist.delete({ where: { id: wishlistId } });
}

export async function addListingToWishlist(
  userId: string,
  wishlistId: string,
  listingId: string,
): Promise<WishlistDto> {
  const wishlist = await assertOwnedWishlist(userId, wishlistId);

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, title: true },
  });
  if (!listing) throw notFound("房源不存在或已下架");

  const duplicate = await prisma.wishlistItem.findUnique({
    where: { wishlistId_listingId: { wishlistId, listingId } },
    select: { id: true },
  });
  if (duplicate) throw conflict(`「${listing.title}」已在心愿单「${wishlist.name}」中`);

  try {
    await prisma.wishlistItem.create({ data: { wishlistId, listingId } });
  } catch (error) {
    // Guard against a concurrent double-click hitting the unique constraint.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw conflict(`「${listing.title}」已在心愿单「${wishlist.name}」中`);
    }
    throw error;
  }

  return getWishlist(userId, wishlistId);
}

export async function removeListingFromWishlist(
  userId: string,
  wishlistId: string,
  listingId: string,
): Promise<WishlistDto> {
  await assertOwnedWishlist(userId, wishlistId);

  const existing = await prisma.wishlistItem.findUnique({
    where: { wishlistId_listingId: { wishlistId, listingId } },
    select: { id: true },
  });
  if (!existing) throw notFound("该房源不在此心愿单中");

  await prisma.wishlistItem.delete({ where: { id: existing.id } });
  return getWishlist(userId, wishlistId);
}

/** All listing ids this user has saved anywhere — powers the heart icon state. */
export async function getSavedListingIds(userId: string): Promise<string[]> {
  const rows = await prisma.wishlistItem.findMany({
    where: { wishlist: { userId } },
    select: { listingId: true },
  });
  return [...new Set(rows.map((r) => r.listingId))];
}

/** Which of this user's wishlists contain the given listing. */
export async function getWishlistsContaining(
  userId: string,
  listingId: string,
): Promise<Array<{ id: string; name: string }>> {
  const rows = await prisma.wishlist.findMany({
    where: { userId, items: { some: { listingId } } },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  return rows;
}

export async function findWishlistByName(
  userId: string,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const clean = name?.trim();
  if (!clean) return null;
  const row = await prisma.wishlist.findFirst({
    where: { userId, name: { equals: clean, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  return row;
}

/**
 * Resolve a target wishlist for the Agent: by id, else by name, else the user's
 * oldest wishlist, else create a default one. Keeps "add this to my wishlist"
 * working even for a brand-new account.
 */
export async function resolveTargetWishlist(
  userId: string,
  options: { wishlistId?: string; wishlistName?: string } = {},
): Promise<{ id: string; name: string; created: boolean }> {
  if (options.wishlistId) {
    const owned = await assertOwnedWishlist(userId, options.wishlistId);
    return { id: owned.id, name: owned.name, created: false };
  }

  if (options.wishlistName) {
    const byName = await findWishlistByName(userId, options.wishlistName);
    if (byName) return { id: byName.id, name: byName.name, created: false };
  }

  const oldest = await prisma.wishlist.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (oldest) return { id: oldest.id, name: oldest.name, created: false };

  const name = normaliseName(options.wishlistName ?? "我的心愿单");
  const created = await prisma.wishlist.create({
    data: { userId, name },
    select: { id: true, name: true },
  });
  return { id: created.id, name: created.name, created: true };
}
