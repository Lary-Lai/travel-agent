/**
 * Data inspection helper for development.
 *
 * Run with: npx tsx scripts/inspect.ts [section]
 * Sections: cities | scenario | amenities | prices | all (default)
 */
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch {
  // .env already provided via the environment
}

async function main() {
  const { prisma } = await import("../lib/db");

  const section = process.argv[2] ?? "all";
  const wants = (name: string) => section === "all" || section === name;

  const heading = (text: string) => console.log(`\n=== ${text} ===`);

  if (wants("cities")) {
    heading("listings per city");
    const rows = await prisma.$queryRaw<
      Array<{ city: string; listings: bigint; min_price: number; avg_price: number; max_price: number }>
    >`
      select "city",
             count(*)::int            as listings,
             min("pricePerNight")     as min_price,
             round(avg("pricePerNight"))::int as avg_price,
             max("pricePerNight")     as max_price
      from "Listing"
      group by "city"
      order by "city"`;
    console.table(rows);
  }

  if (wants("scenario")) {
    heading("DEMO: Tokyo, >=4 guests, 600-1000 CNY/night, near subway");
    const rows = await prisma.$queryRaw<
      Array<{ title: string; price: number; guests: number; type: string; rating: number; reviews: number }>
    >`
      select l."title"          as title,
             l."pricePerNight"  as price,
             l."maxGuests"      as guests,
             l."propertyType"::text as type,
             l."rating"         as rating,
             l."reviewCount"    as reviews
      from "Listing" l
      where l."city" = 'Tokyo'
        and l."maxGuests" >= 4
        and l."pricePerNight" between 600 and 1000
        and exists (
          select 1 from "ListingAmenity" la
          join "Amenity" a on a.id = la."amenityId"
          where la."listingId" = l.id and a.name = '地铁附近'
        )
      order by l."pricePerNight"
      limit 15`;
    console.table(rows);
    console.log(`matches: ${rows.length} (need >= 3 for the recommendation demo)`);
  }

  if (wants("amenities")) {
    heading("near-subway coverage");
    const rows = await prisma.$queryRaw<Array<{ with_subway: number; total: number }>>`
      select count(distinct l.id) filter (
               where exists (
                 select 1 from "ListingAmenity" la
                 join "Amenity" a on a.id = la."amenityId"
                 where la."listingId" = l.id and a.name = '地铁附近'
               )
             )::int as with_subway,
             count(distinct l.id)::int as total
      from "Listing" l`;
    console.table(rows);

    heading("amenities per category");
    const cats = await prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
      select "category", count(*)::int as count from "Amenity" group by "category" order by "category"`;
    console.table(cats);
  }

  if (wants("prices")) {
    heading("price distribution");
    const rows = await prisma.$queryRaw<
      Array<{ property_type: string; listings: number; min_price: number; avg_price: number; max_price: number }>
    >`
      select "propertyType"::text as property_type,
             count(*)::int as listings,
             min("pricePerNight") as min_price,
             round(avg("pricePerNight"))::int as avg_price,
             max("pricePerNight") as max_price
      from "Listing"
      group by "propertyType"
      order by avg_price`;

    // Raw aggregates come back as Postgres int/double; coerce bigint for display.
    console.table(
      rows.map((r) => ({ ...r, listings: Number(r.listings) })),
    );

    heading("guest capacity coverage");
    const guests = await prisma.$queryRaw<Array<{ max_guests: number; listings: number }>>`
      select "maxGuests" as max_guests, count(*)::int as listings
      from "Listing" group by "maxGuests" order by "maxGuests"`;
    console.table(guests.map((g) => ({ ...g, listings: Number(g.listings) })));
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("inspect failed:", error);
  process.exit(1);
});
