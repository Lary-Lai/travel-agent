/**
 * Database seed.
 *
 * Generates a realistic dataset: 6 cities x 12 listings = 72 listings, each with
 * a gallery, amenities, a host, ratings and room details — plus one demo account
 * with two pre-populated wishlists so the UI is never empty on first run.
 *
 * Deterministic: a fixed-seed PRNG means re-seeding yields identical data.
 *
 * Run with: npm run db:seed
 */
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch {
  // .env already provided via the environment
}

import bcrypt from "bcryptjs";

import { PrismaPg } from "@prisma/adapter-pg";

import { AMENITY_CATALOG, galleryAnglesFor } from "../lib/amenities";
import { CITIES, type CityMeta } from "../lib/cities";
import { PrismaClient } from "../lib/generated/prisma/client";

// 45 Unsplash photo ids, each verified to return HTTP 200.
const PHOTO_IDS = [
  "photo-1522708323590-d24dbb6b0267",
  "photo-1502672260266-1c1ef2d93688",
  "photo-1560448204-e02f11c3d0e2",
  "photo-1493809842364-78817add7ffb",
  "photo-1484154218962-a197022b5858",
  "photo-1512918728675-ed5a9ecdebfd",
  "photo-1571055107559-3e67626fa8be",
  "photo-1566073771259-6a8506099945",
  "photo-1502005229762-cf1b2da7c5d6",
  "photo-1416331108676-a22ccb276e35",
  "photo-1554995207-c18c203602cb",
  "photo-1600585154340-be6161a56a0c",
  "photo-1600607687939-ce8a6c25118c",
  "photo-1600566753086-00f18fb6b3ea",
  "photo-1600210492486-724fe5c67fb0",
  "photo-1586023492125-27b2c045efd7",
  "photo-1616486338812-3dadae4b4ace",
  "photo-1618221195710-dd6b41faaea6",
  "photo-1582268611958-ebfd161ef9cf",
  "photo-1560185007-cde436f6a4d0",
  "photo-1560185127-6ed189bf02f4",
  "photo-1522771739844-6a9f6d5f14af",
  "photo-1499793983690-e29da59ef1c2",
  "photo-1552321554-5fefe8c9ef14",
  "photo-1540518614846-7eded433c457",
  "photo-1519643381401-22c77e60520e",
  "photo-1505873242700-f289a29e1e0f",
  "photo-1513694203232-719a280e022f",
  "photo-1507089947368-19c1da9775ae",
  "photo-1598928506311-c55ded91a20c",
  "photo-1567767292278-a4f21aa2d36e",
  "photo-1552733407-5d5c46c3bb3b",
  "photo-1520250497591-112f2f40a3f4",
  "photo-1445019980597-93fa8acb246c",
  "photo-1571003123894-1f0594d2b5d9",
  "photo-1542314831-068cd1dbfeeb",
  "photo-1502672023488-70e25813eb80",
  "photo-1493663284031-b7e3aefcae8e",
  "photo-1568495248636-6432b97bd949",
  "photo-1533105079780-92b9be482077",
  "photo-1540541338287-41700207dee6",
  "photo-1571896349842-33c89424de2d",
  "photo-1517840901100-8179e982acb7",
  "photo-1611892440504-42a792e24d32",
  "photo-1590490360182-c33d57733427",
];

const photoUrl = (id: string, width = 1200) =>
  `https://images.unsplash.com/${id}?w=${width}&q=75&auto=format&fit=crop`;

/** Fixed-seed PRNG so every seed run produces the same dataset. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261001);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const chance = (probability: number) => rand() < probability;
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** The 12 listing shapes built for every city. */
type Shape = {
  propertyType: "APARTMENT" | "HOUSE" | "HOTEL" | "VILLA" | "LOFT" | "GUESTHOUSE";
  bedrooms: number;
  beds: number;
  bathrooms: number;
  maxGuests: number;
  priceMultiplier: number;
};

const SHAPES: Shape[] = [
  { propertyType: "APARTMENT", bedrooms: 1, beds: 1, bathrooms: 1, maxGuests: 2, priceMultiplier: 1.0 },
  { propertyType: "APARTMENT", bedrooms: 1, beds: 2, bathrooms: 1, maxGuests: 3, priceMultiplier: 1.0 },
  { propertyType: "APARTMENT", bedrooms: 2, beds: 3, bathrooms: 1, maxGuests: 4, priceMultiplier: 1.0 },
  { propertyType: "APARTMENT", bedrooms: 2, beds: 4, bathrooms: 1, maxGuests: 4, priceMultiplier: 1.0 },
  { propertyType: "APARTMENT", bedrooms: 1, beds: 2, bathrooms: 1, maxGuests: 2, priceMultiplier: 1.0 },
  { propertyType: "HOUSE", bedrooms: 3, beds: 4, bathrooms: 2, maxGuests: 6, priceMultiplier: 1.5 },
  { propertyType: "HOUSE", bedrooms: 4, beds: 6, bathrooms: 2, maxGuests: 8, priceMultiplier: 1.5 },
  { propertyType: "HOTEL", bedrooms: 1, beds: 1, bathrooms: 1, maxGuests: 2, priceMultiplier: 1.25 },
  { propertyType: "HOTEL", bedrooms: 2, beds: 3, bathrooms: 1, maxGuests: 4, priceMultiplier: 1.25 },
  { propertyType: "LOFT", bedrooms: 2, beds: 3, bathrooms: 1, maxGuests: 4, priceMultiplier: 1.15 },
  { propertyType: "VILLA", bedrooms: 4, beds: 6, bathrooms: 3, maxGuests: 8, priceMultiplier: 2.0 },
  { propertyType: "GUESTHOUSE", bedrooms: 1, beds: 2, bathrooms: 1, maxGuests: 3, priceMultiplier: 0.7 },
];

const ADJECTIVES = ["温馨", "现代", "明亮", "静谧", "复古", "简约", "精致", "舒适", "通透", "雅致"];

const HOSTS = [
  { name: "林晓", email: "host.linxiao@travel-agent.dev" },
  { name: "陈默", email: "host.chenmo@travel-agent.dev" },
  { name: "Aiko Tanaka", email: "aiko.tanaka@travel-agent.dev" },
  { name: "Luc Moreau", email: "luc.moreau@travel-agent.dev" },
  { name: "Emma Whitfield", email: "emma.whitfield@travel-agent.dev" },
  { name: "Marcus Reid", email: "marcus.reid@travel-agent.dev" },
  { name: "Priya Nair", email: "priya.nair@travel-agent.dev" },
  { name: "Kim Ji-ho", email: "kim.jiho@travel-agent.dev" },
];

const DEMO_EMAIL = "demo@travel-agent.dev";
const DEMO_PASSWORD = "Demo1234";

/** Every seeded account uses this domain; anything else is a real registration. */
const SEED_EMAIL_DOMAIN = "@travel-agent.dev";

/** Build a unique, realistic title for a listing. */
function buildTitle(city: CityMeta, neighborhood: string, shape: Shape, used: Set<string>): string {
  const adj = pick(ADJECTIVES);
  const walk = intBetween(2, 9);

  const candidates: Record<Shape["propertyType"], string[]> = {
    APARTMENT: [
      `${neighborhood}站步行${walk}分钟 · ${adj}公寓`,
      `${neighborhood} · ${adj}一居室`,
      `${neighborhood}核心区 · ${adj}两居公寓`,
      `${neighborhood}设计师公寓 · 近地铁`,
      `${neighborhood}高层公寓 · 城市景观`,
    ],
    HOUSE: [
      `${neighborhood}独栋小院 · 可住${shape.maxGuests}人`,
      `${neighborhood}${adj}独栋 · 带花园`,
      `${neighborhood}家庭独栋 · ${shape.maxGuests}人入住`,
    ],
    HOTEL: [
      `${neighborhood}${adj}精品酒店 · 含早餐`,
      `${neighborhood}设计酒店 · 地铁旁`,
      `${neighborhood}${adj}酒店套房`,
    ],
    VILLA: [
      `${neighborhood}带泳池别墅 · 私享庭院`,
      `${neighborhood}${adj}别墅 · 可住${shape.maxGuests}人`,
    ],
    LOFT: [`${neighborhood}工业风LOFT · 挑高空间`, `${neighborhood}复式LOFT · 采光极佳`],
    GUESTHOUSE: [`${neighborhood}温馨民宿 · 本地生活圈`, `${neighborhood}家庭式民宿 · 独立卫浴`],
  };

  for (const base of candidates[shape.propertyType]) {
    const title = `${base}｜${city.nameZh}`;
    if (!used.has(title)) {
      used.add(title);
      return title;
    }
  }

  // Guaranteed-unique fallback.
  let n = 2;
  let title = `${neighborhood}${adj}房源｜${city.nameZh}`;
  while (used.has(title)) title = `${neighborhood}${adj}房源 ${n++}｜${city.nameZh}`;
  used.add(title);
  return title;
}

function buildDescription(city: CityMeta, neighborhood: string, shape: Shape, nearSubway: boolean): string {
  const transit = nearSubway
    ? `步行 ${intBetween(2, 8)} 分钟即达地铁站，去往${city.nameZh}各大景点都很方便。`
    : `周边公交线路密集，打车前往市中心约 ${intBetween(10, 25)} 分钟。`;

  const roomSummary =
    shape.propertyType === "HOTEL"
      ? `房间为${shape.bedrooms}室${shape.bathrooms}卫布局，最多可住 ${shape.maxGuests} 人，每日提供客房清洁。`
      : `房源为${shape.bedrooms}室${shape.bathrooms}卫，共 ${shape.beds} 张床，最多可住 ${shape.maxGuests} 人。`;

  const highlight =
    shape.propertyType === "VILLA"
      ? "独立泳池与庭院非常适合家庭聚会，傍晚可以在户外用餐区烧烤。"
      : shape.propertyType === "HOUSE"
        ? "整栋独立使用，配有独立厨房与起居空间，适合多人同行。"
        : shape.propertyType === "LOFT"
          ? "挑高设计与落地窗让空间格外通透，白天采光极佳。"
          : shape.propertyType === "GUESTHOUSE"
            ? "房东就住在附近，可以随时提供本地餐厅与出行建议。"
            : "房间采光良好，配有独立厨房与高速无线网络，适合短途旅行或长住办公。";

  const area = `位于${city.nameZh}${neighborhood}，周边餐厅、便利店与超市步行可达。`;

  return `${area}${transit}${roomSummary}${highlight}`;
}

/** Amenities appropriate to each property type, plus probabilistic extras. */
function buildAmenities(shape: Shape): string[] {
  const set = new Set<string>(["无线网络", "空调", "暖气", "热水", "烟雾报警器", "自助入住"]);

  const isHome = ["APARTMENT", "HOUSE", "LOFT", "GUESTHOUSE"].includes(shape.propertyType);
  if (isHome) set.add("厨房");
  if (shape.propertyType === "HOTEL") {
    set.add("含早餐");
    set.add("电梯");
    set.add("吹风机");
  }
  if (shape.propertyType === "VILLA") {
    set.add("游泳池");
    set.add("花园");
    set.add("烧烤设备");
    set.add("免费停车");
    set.add("厨房");
  }
  if (shape.propertyType === "HOUSE") {
    set.add("免费停车");
    if (chance(0.7)) set.add("花园");
    if (chance(0.5)) set.add("烧烤设备");
  }

  // Transit is what the "near the subway" AI preference keys off, so make it
  // common for city apartments/lofts and rarer for standalone houses/villas.
  const transitProbability = ["APARTMENT", "LOFT", "HOTEL"].includes(shape.propertyType)
    ? 0.78
    : 0.25;
  if (chance(transitProbability)) set.add("地铁附近");

  const optional: Array<[string, number]> = [
    ["洗衣机", 0.75],
    ["电视", 0.85],
    ["吹风机", 0.8],
    ["熨斗", 0.55],
    ["专用办公区", 0.45],
    ["阳台", 0.5],
    ["电梯", 0.5],
    ["浴缸", 0.35],
    ["健身房", 0.3],
    ["自助入住", 0.4],
    ["可带宠物", 0.2],
    ["婴儿床", 0.25],
    ["长租可议", 0.3],
    ["一氧化碳报警器", 0.6],
  ];
  for (const [name, probability] of optional) if (chance(probability)) set.add(name);

  return [...set];
}

/**
 * One photo per viewing angle, each carrying its caption.
 * The stride keeps every image inside a listing distinct (gcd(11, 45) = 1).
 */
function buildImages(index: number, propertyType: string) {
  const angles = galleryAnglesFor(propertyType);

  return angles.map((caption, i) => {
    const id = PHOTO_IDS[(index * 7 + i * 11) % PHOTO_IDS.length];
    return { url: photoUrl(id), position: i, caption };
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and run `npm run db:start`.");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

  // ---------------------------------------------------------------------------
  // This seed is RE-RUNNABLE and non-destructive to real user data.
  //
  // Earlier versions called `user.deleteMany()` and `listing.deleteMany()`, so
  // re-seeding silently destroyed accounts that had been registered through the
  // app. Now:
  //   - seed users are upserted by email (their ids, and therefore the listings
  //     they host, stay stable)
  //   - listings are upserted by `seedKey`, so listing ids survive too
  //   - accounts registered by real people are never touched
  //   - because listing ids survive, real users' wishlists and bookings are
  //     not cascade-deleted either
  // ---------------------------------------------------------------------------

  console.log("[seed] amenities (upsert) ...");
  for (const amenity of AMENITY_CATALOG) {
    await prisma.amenity.upsert({
      where: { name: amenity.name },
      create: amenity,
      update: {
        icon: amenity.icon,
        category: amenity.category,
        description: amenity.description,
      },
    });
  }
  const amenities = await prisma.amenity.findMany();
  const amenityIdByName = new Map(amenities.map((a) => [a.name, a.id]));

  // One hash reused for every seeded account — bcrypt is intentionally slow.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  console.log("[seed] hosts + demo account (upsert) ...");
  const hosts: Array<{ id: string }> = [];
  for (const [i, host] of HOSTS.entries()) {
    hosts.push(
      await prisma.user.upsert({
        where: { email: host.email },
        create: {
          email: host.email,
          name: host.name,
          password: passwordHash,
          avatar: `https://i.pravatar.cc/160?img=${(i % 60) + 1}`,
        },
        // Keep the password as-is so a changed demo password is not reset.
        update: { name: host.name, avatar: `https://i.pravatar.cc/160?img=${(i % 60) + 1}` },
      }),
    );
  }

  const demoUser = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      name: "演示用户",
      password: passwordHash,
      avatar: "https://i.pravatar.cc/160?img=68",
    },
    update: {},
  });

  // One-time transition: rows created by the previous destructive seed have no
  // seedKey. They cannot be matched by upsert, so remove them once. Users cannot
  // create listings in this app, so every keyless listing is legacy seed data.
  const legacy = await prisma.listing.deleteMany({ where: { seedKey: null } });
  if (legacy.count > 0) {
    console.log(`[seed] removed ${legacy.count} legacy listing(s) with no seedKey`);
  }

  console.log("[seed] listings (upsert by seedKey) ...");
  const usedTitles = new Set<string>();
  const listingIdsByCity = new Map<string, string[]>();
  const producedKeys: string[] = [];
  let index = 0;

  for (const city of CITIES) {
    // Shuffle neighborhoods so each city gets a distinct spread.
    const neighborhoods = [...city.neighborhoods].sort(() => rand() - 0.5);

    for (let s = 0; s < SHAPES.length; s++) {
      const shape = SHAPES[s];
      const neighborhood = neighborhoods[s % neighborhoods.length];
      const title = buildTitle(city, neighborhood, shape, usedTitles);

      const price = roundTo(city.basePrice * shape.priceMultiplier * between(0.82, 1.22), 10);
      const amenityNames = buildAmenities(shape);
      const nearSubway = amenityNames.includes("地铁附近");

      // Stable across runs: same city + shape position -> same listing row.
      const seedKey = `${city.name.toLowerCase().replace(/\s+/g, "-")}-${shape.propertyType.toLowerCase()}-${s}`;
      producedKeys.push(seedKey);

      const scalarFields = {
        title,
        description: buildDescription(city, neighborhood, shape, nearSubway),
        location: `${neighborhood}, ${city.nameZh}`,
        city: city.name,
        country: city.country,
        latitude: Number((city.latitude + between(-0.045, 0.045)).toFixed(6)),
        longitude: Number((city.longitude + between(-0.045, 0.045)).toFixed(6)),
        pricePerNight: price,
        propertyType: shape.propertyType,
        rating: Number(between(4.2, 5.0).toFixed(2)),
        reviewCount: intBetween(6, 480),
        maxGuests: shape.maxGuests,
        bedrooms: shape.bedrooms,
        beds: shape.beds,
        bathrooms: shape.bathrooms,
        hostId: hosts[index % hosts.length].id,
      };

      const amenityRows = amenityNames
        .map((name) => amenityIdByName.get(name))
        .filter((id): id is string => Boolean(id))
        .map((amenityId) => ({ amenityId }));

      const listing = await prisma.listing.upsert({
        where: { seedKey },
        create: {
          seedKey,
          ...scalarFields,
          images: { create: buildImages(index, shape.propertyType) },
          amenities: { create: amenityRows },
        },
        update: {
          ...scalarFields,
          // Gallery and amenities are fully regenerated; the listing row (and
          // therefore its id) is preserved.
          images: { deleteMany: {}, create: buildImages(index, shape.propertyType) },
          amenities: { deleteMany: {}, create: amenityRows },
        },
      });

      const bucket = listingIdsByCity.get(city.name) ?? [];
      bucket.push(listing.id);
      listingIdsByCity.set(city.name, bucket);
      index++;
    }
  }

  // Remove only listings this seed used to produce but no longer does.
  const stale = await prisma.listing.deleteMany({
    where: { seedKey: { notIn: producedKeys } },
  });
  if (stale.count > 0) console.log(`[seed] removed ${stale.count} stale listing(s)`);

  console.log("[seed] demo wishlists (upsert) ...");
  const tokyoListings = (listingIdsByCity.get("Tokyo") ?? []).slice(0, 3);
  const europeListings = [
    ...(listingIdsByCity.get("Paris") ?? []).slice(0, 1),
    ...(listingIdsByCity.get("London") ?? []).slice(0, 1),
  ];

  /**
   * Ensure a demo wishlist exists with its starter listings.
   *
   * Deliberately non-destructive: if the user has already curated this wishlist
   * (added or removed listings), it is left completely alone. Only an empty or
   * missing one is (re)filled.
   */
  const ensureWishlist = async (name: string, listingIds: string[]) => {
    const existing = await prisma.wishlist.findUnique({
      where: { userId_name: { userId: demoUser.id, name } },
      select: { id: true, _count: { select: { items: true } } },
    });

    if (!existing) {
      await prisma.wishlist.create({
        data: {
          name,
          userId: demoUser.id,
          items: { create: listingIds.map((listingId) => ({ listingId })) },
        },
      });
      return "created";
    }

    if (existing._count.items === 0) {
      await prisma.wishlistItem.createMany({
        data: listingIds.map((listingId) => ({ wishlistId: existing.id, listingId })),
        skipDuplicates: true,
      });
      return "refilled";
    }

    return "kept";
  };

  const tokyoResult = await ensureWishlist("东京旅行", tokyoListings);
  const europeResult = await ensureWishlist("欧洲之旅", europeListings);
  console.log(`[seed] demo wishlists: 东京旅行=${tokyoResult}, 欧洲之旅=${europeResult}`);

  const [listingCount, wishlistCount, itemCount, accountCount, realAccounts] = await Promise.all([
    prisma.listing.count(),
    prisma.wishlist.count(),
    prisma.wishlistItem.count(),
    prisma.user.count(),
    // Accounts that did NOT come from the seed — i.e. real registrations.
    prisma.user.count({ where: { email: { not: { endsWith: SEED_EMAIL_DOMAIN } } } }),
  ]);

  console.log(
    `[seed] done: ${listingCount} listings, ${CITIES.length} cities, ${amenities.length} amenities, ` +
      `${wishlistCount} wishlists, ${itemCount} wishlist items`,
  );
  console.log(
    `[seed] accounts: ${accountCount} total, ${realAccounts} registered by real users (preserved)`,
  );
  console.log(`[seed] demo login -> ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[seed] FAILED:", error);
  process.exit(1);
});
