/**
 * End-to-end database smoke test.
 *
 * Proves the full chain works against real PostgreSQL:
 *   Prisma Client -> pg driver adapter -> PostgreSQL 18
 *
 * Run with: npx tsx scripts/verify-db.ts
 *
 * Deliberately avoids top-level await: this file is compiled as CJS by tsx
 * (package.json has no "type": "module").
 */
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch {
  // .env already provided via the environment
}

async function main() {
  // Imported dynamically so that .env is loaded before lib/db.ts reads
  // process.env.DATABASE_URL at module scope.
  const { prisma } = await import("../lib/db.ts");

  let failed = false;

  const checks: Array<[string, () => Promise<unknown>]> = [
    [
      "server version",
      async () => {
        const rows = await prisma.$queryRaw<Array<{ v: string }>>`select version() as v`;
        return rows[0].v.split(" on ")[0];
      },
    ],
    [
      "native enums exist",
      async () => {
        const rows = await prisma.$queryRaw<Array<{ typname: string }>>`
          select typname from pg_type
          where typname in ('PropertyType', 'BookingStatus')
          order by typname`;
        return rows.map((r) => r.typname);
      },
    ],
    [
      "row counts",
      async () => ({
        users: await prisma.user.count(),
        listings: await prisma.listing.count(),
        wishlists: await prisma.wishlist.count(),
        wishlistItems: await prisma.wishlistItem.count(),
        bookings: await prisma.booking.count(),
        amenities: await prisma.amenity.count(),
      }),
    ],
  ];

  for (const [label, run] of checks) {
    try {
      console.log(`  OK   ${label}:`, JSON.stringify(await run()));
    } catch (error) {
      failed = true;
      console.error(`  FAIL ${label}:`, error instanceof Error ? error.message : error);
    }
  }

  // Round-trip: write, read, enforce constraints, then cascade-delete.
  const stamp = Date.now();
  try {
    const user = await prisma.user.create({
      data: { email: `smoke-${stamp}@example.com`, password: "hashed", name: "Smoke Test" },
    });

    const listing = await prisma.listing.create({
      data: {
        title: "Smoke Listing",
        description: "temporary row",
        location: "Test District",
        city: "Tokyo",
        country: "Japan",
        latitude: 35.68,
        longitude: 139.76,
        pricePerNight: 12345,
        propertyType: "APARTMENT",
        rating: 4.5,
        reviewCount: 7,
        maxGuests: 4,
        bedrooms: 2,
        beds: 2,
        bathrooms: 1,
        hostId: user.id,
        images: { create: [{ url: "https://example.com/a.jpg", position: 0 }] },
        amenities: {
          create: [
            { amenity: { create: { name: `Wifi-${stamp}`, icon: "wifi", category: "basic" } } },
          ],
        },
      },
    });

    const wishlist = await prisma.wishlist.create({
      data: { name: `Smoke-${stamp}`, userId: user.id },
    });
    await prisma.wishlistItem.create({ data: { wishlistId: wishlist.id, listingId: listing.id } });

    // The (wishlistId, listingId) unique constraint must reject a duplicate.
    let duplicateRejected = false;
    try {
      await prisma.wishlistItem.create({
        data: { wishlistId: wishlist.id, listingId: listing.id },
      });
    } catch {
      duplicateRejected = true;
    }

    // A second wishlist with the same name for the same user must be rejected.
    let duplicateWishlistRejected = false;
    try {
      await prisma.wishlist.create({ data: { name: `Smoke-${stamp}`, userId: user.id } });
    } catch {
      duplicateWishlistRejected = true;
    }

    const loaded = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      include: { images: true, amenities: { include: { amenity: true } }, wishlistItems: true },
    });

    console.log("  OK   round-trip:", {
      images: loaded.images.length,
      amenities: loaded.amenities.length,
      wishlistItems: loaded.wishlistItems.length,
      duplicateRejected,
      duplicateWishlistRejected,
    });

    if (!duplicateRejected) throw new Error("unique(wishlistId, listingId) NOT enforced");
    if (!duplicateWishlistRejected) throw new Error("unique(userId, name) NOT enforced");

    // Deleting the host must cascade: listings and their wishlist items vanish.
    await prisma.user.delete({ where: { id: user.id } });
    const orphanListings = await prisma.listing.count({ where: { id: listing.id } });
    const orphanItems = await prisma.wishlistItem.count({ where: { listingId: listing.id } });
    const orphanWishlists = await prisma.wishlist.count({ where: { id: wishlist.id } });
    console.log("  OK   cascade delete:", { orphanListings, orphanItems, orphanWishlists });

    if (orphanListings || orphanItems || orphanWishlists) throw new Error("cascade delete failed");

    await prisma.amenity.deleteMany({ where: { name: { startsWith: "Wifi-" } } });
  } catch (error) {
    failed = true;
    console.error("  FAIL round-trip:", error instanceof Error ? error.message : error);
  }

  await prisma.$disconnect();
  console.log(failed ? "\nDATABASE: FAILED" : "\nDATABASE: ALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("verify-db crashed:", error);
  process.exit(1);
});
