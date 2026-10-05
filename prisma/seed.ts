/**
 * Database seed.
 *
 * Generates a realistic dataset: one listing per shape per city (18 shapes x 10
 * cities = 180 listings), each with a gallery, amenities, a host, ratings and
 * room details — plus one demo account with two pre-populated wishlists so the
 * UI is never empty on first run.
 *
 * Deterministic: a fixed-seed PRNG means re-seeding yields identical data.
 *
 * Run with: npm run db:seed
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch {
  // .env already provided via the environment
}

import bcrypt from "bcryptjs";

import { PrismaPg } from "@prisma/adapter-pg";

import { AMENITY_CATALOG, galleryAnglesFor } from "../lib/amenities";
import { presetAvatarFor } from "../lib/avatars";
import { CITIES, type CityMeta } from "../lib/cities";
import { buildLocalizedListingText } from "../lib/i18n/listing-text";
import { PrismaClient } from "../lib/generated/prisma/client";

// 45 photo ids, each verified to return HTTP 200.
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

/**
 * Photos bundled under `public/listings/` by `npm run images:fetch`.
 *
 * Serving these from disk removes the upstream fetch completely. Measured on
 * this machine, `images.unsplash.com` took up to **114 seconds** for a single
 * 148KB photo and failed outright on roughly a third of requests; Next's image
 * optimizer gives the upstream ~7s and then answers 504, so cards fell back to a
 * placeholder while the page looked like it had hung. Local files are instant,
 * work offline, and still get resized per breakpoint by `next/image`.
 *
 * Anything not downloaded yet falls back to the original remote URL, so a fresh
 * clone still works (just more slowly).
 */
function loadBundledPhotos(): Set<string> {
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "public", "listings", "manifest.json"), "utf8"),
    ) as { photos?: Array<{ id: string }> };
    return new Set((manifest.photos ?? []).map((photo) => photo.id));
  } catch {
    return new Set();
  }
}

const BUNDLED_PHOTOS = loadBundledPhotos();

const REMOTE_WIDTH = 1080;
const REMOTE_QUALITY = 72;

const photoUrl = (id: string) =>
  BUNDLED_PHOTOS.has(id)
    ? `/listings/${id}.jpg`
    : `https://images.unsplash.com/${id}?w=${REMOTE_WIDTH}&q=${REMOTE_QUALITY}&auto=format&fit=crop`;

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

/** The listing shapes built for every city (one listing each). */
type Shape = {
  propertyType: "APARTMENT" | "HOUSE" | "HOTEL" | "VILLA" | "LOFT" | "GUESTHOUSE";
  bedrooms: number;
  beds: number;
  bathrooms: number;
  maxGuests: number;
  priceMultiplier: number;
};

/**
 * Appended to over time: the seed key is `city-type-index`, so adding a shape at
 * the END only ever creates new listings — it never re-points an existing one
 * (which would break wishlist items and bookings that reference it).
 */
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
  // ---- second wave: more inventory per city, and wider team/family sizes ----
  { propertyType: "APARTMENT", bedrooms: 3, beds: 5, bathrooms: 2, maxGuests: 6, priceMultiplier: 1.3 },
  { propertyType: "HOUSE", bedrooms: 2, beds: 4, bathrooms: 1, maxGuests: 5, priceMultiplier: 1.35 },
  { propertyType: "VILLA", bedrooms: 3, beds: 5, bathrooms: 2, maxGuests: 6, priceMultiplier: 1.75 },
  { propertyType: "LOFT", bedrooms: 1, beds: 2, bathrooms: 1, maxGuests: 2, priceMultiplier: 1.05 },
  { propertyType: "GUESTHOUSE", bedrooms: 2, beds: 3, bathrooms: 1, maxGuests: 4, priceMultiplier: 0.85 },
  { propertyType: "HOTEL", bedrooms: 1, beds: 2, bathrooms: 1, maxGuests: 2, priceMultiplier: 1.2 },
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
function buildTitle(
  city: CityMeta,
  neighborhood: string,
  shape: Shape,
  used: Set<string>,
  /** Chosen by the caller so the localised titles can reuse the same values. */
  chosenAdj?: string,
  chosenWalk?: number,
): string {
  const adj = chosenAdj ?? pick(ADJECTIVES);
  const walk = chosenWalk ?? intBetween(2, 9);

  // Enough candidates per type that a city's listings rarely fall through to the
  // generic numbered fallback below.
  const candidates: Record<Shape["propertyType"], string[]> = {
    APARTMENT: [
      `${neighborhood}站步行${walk}分钟 · ${adj}公寓`,
      `${neighborhood} · ${adj}一居室`,
      `${neighborhood}核心区 · ${adj}两居公寓`,
      `${neighborhood}设计师公寓 · 近地铁`,
      `${neighborhood}高层公寓 · 城市景观`,
      `${neighborhood}${adj}三居 · 家庭出行`,
      `${neighborhood}阳台公寓 · 采光充足`,
      `${neighborhood}新装修公寓 · 可住${shape.maxGuests}人`,
    ],
    HOUSE: [
      `${neighborhood}独栋小院 · 可住${shape.maxGuests}人`,
      `${neighborhood}${adj}独栋 · 带花园`,
      `${neighborhood}家庭独栋 · ${shape.maxGuests}人入住`,
      `${neighborhood}${adj}两层小楼 · 独立入口`,
      `${neighborhood}近公园独栋 · 亲子友好`,
    ],
    HOTEL: [
      `${neighborhood}${adj}精品酒店 · 含早餐`,
      `${neighborhood}设计酒店 · 地铁旁`,
      `${neighborhood}${adj}酒店套房`,
      `${neighborhood}商务酒店 · 24 小时前台`,
      `${neighborhood}精品酒店 · 双床房`,
    ],
    VILLA: [
      `${neighborhood}带泳池别墅 · 私享庭院`,
      `${neighborhood}${adj}别墅 · 可住${shape.maxGuests}人`,
      `${neighborhood}山景别墅 · 露台烧烤`,
      `${neighborhood}${adj}独栋别墅 · 管家服务`,
    ],
    LOFT: [
      `${neighborhood}工业风LOFT · 挑高空间`,
      `${neighborhood}复式LOFT · 采光极佳`,
      `${neighborhood}${adj}LOFT · 开放厨房`,
      `${neighborhood}艺术家LOFT · 近创意园区`,
    ],
    GUESTHOUSE: [
      `${neighborhood}温馨民宿 · 本地生活圈`,
      `${neighborhood}家庭式民宿 · 独立卫浴`,
      `${neighborhood}${adj}民宿 · 含手作早餐`,
      `${neighborhood}老宅民宿 · 庭院天井`,
    ],
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

/**
 * Check-in logistics and house rules.
 *
 * Derived from the listing's own attributes so the rules never contradict the
 * amenities (a place advertising 可带宠物 must not also say 禁止宠物), which is
 * the usual way this kind of text goes wrong when it is written by hand.
 */
function buildHouseRules(shape: Shape, amenityNames: string[]): {
  checkInTime: string;
  checkOutTime: string;
  houseRules: string[];
  houseNotes: string[];
} {
  const has = (name: string) => amenityNames.includes(name);

  const rules = [
    "入住时间后可使用门锁密码自助入住",
    shape.propertyType === "HOTEL" ? "请在前台出示身份证件办理登记" : "请勿在室内吸烟",
    "晚上 22:00 后请保持安静，避免影响邻居",
  ];

  if (has("可带宠物")) rules.push("可携带宠物，请自备宠物用品并清理毛发");
  else rules.push("恕不接待宠物");

  if (shape.maxGuests > 4) rules.push("不接受聚会或派对活动");
  else rules.push("不适合举办聚会");

  const notes = [
    has("免费停车") ? "楼下有免费停车位，先到先得" : "周边路边可停车，费用约 20 元/小时",
    has("地铁附近") ? "步行可达地铁站，建议乘公共交通出行" : "建议打车或自驾前往，周边公交线路密集",
    has("专属办公区") ? "书桌区域配有插座与台灯，适合远程办公" : "客厅可临时办公，但没有专用书桌",
    "如需延迟退房请提前一天告知，视房态而定",
  ];

  return {
    // Hotels run later check-outs than private homes; both are plausible defaults.
    checkInTime: shape.propertyType === "HOTEL" ? "14:00" : "15:00",
    checkOutTime: shape.propertyType === "HOTEL" ? "12:00" : "11:00",
    houseRules: rules,
    houseNotes: notes,
  };
}

/**
 * Guest accounts that author the seeded reviews.
 *
 * Separate from HOSTS on purpose: a host reviewing their own listing is a
 * credibility hole, and the review service rejects it — so the seed must not
 * create data the app itself would refuse.
 */
const REVIEWERS = [
  { name: "周小满", email: "guest.zhou@travel-agent.dev" },
  { name: "许知远", email: "guest.xu@travel-agent.dev" },
  { name: "Nina Fischer", email: "nina.fischer@travel-agent.dev" },
  { name: "Tomás Rivera", email: "tomas.rivera@travel-agent.dev" },
  { name: "郑一诺", email: "guest.zheng@travel-agent.dev" },
  { name: "Aisha Rahman", email: "aisha.rahman@travel-agent.dev" },
];

/** Comment bodies per rating, so the text matches the stars. */
const REVIEW_TEMPLATES: Record<number, string[]> = {
  5: [
    "位置非常好，出门就是地铁，房间比照片还干净。房东回复很快，入住全程没有任何问题。",
    "采光特别好，早上坐在窗边喝咖啡很舒服。厨房用具齐全，自己做饭完全够用。",
    "第二次住这里了，依然很满意。床垫软硬适中，隔音也比想象中好。",
  ],
  4: [
    "整体很不错，房间整洁、交通方便。唯一的小问题是晚上热水来得有点慢。",
    "和描述基本一致，性价比高。周边吃饭方便，走几步就有便利店。",
    "住得挺舒服，房东也很热情。如果能有更多衣架就更好了。",
  ],
  3: [
    "位置和价格都还行，但房间比照片看起来小一些，两个人住刚好。",
    "基本能满足需求。楼上有装修声，白天在房间休息会有点吵。",
  ],
};

const REVIEW_WITH_SCORES = Object.entries(REVIEW_TEMPLATES).flatMap(([rating, comments]) =>
  comments.map((comment) => ({ rating: Number(rating), comment })),
);

/**
 * Forum boards (板块).
 *
 * `slug` is the stable identity — it is what the seed upserts on and what the UI
 * puts in the URL (`/forum?board=ski`), so renaming a board's Chinese `name`
 * never breaks a shared link. `name` / `description` are the authored Chinese
 * values that the API and the Agent read; `nameI18n` / `descriptionI18n` are what
 * the UI renders, exactly like `Listing.titleI18n`.
 *
 * `position` is the display order of the rail and is deliberately explicit
 * rather than alphabetical: the first two boards are what most people come for.
 */
type BoardSeed = {
  slug: string;
  name: string;
  description: string;
  /** Lucide icon name, so the UI can render an icon where an emoji would not fit. */
  icon: string;
  emoji: string;
  position: number;
};

const BOARDS: BoardSeed[] = [
  {
    slug: "ski",
    name: "滑雪旅行",
    description: "雪季开板、雪场选择与装备经验，从北海道到阿尔卑斯。",
    icon: "MountainSnow",
    emoji: "🎿",
    position: 1,
  },
  {
    slug: "beach",
    name: "海滨度假",
    description: "海岛、海滩与潜水，聊季节、潮汐和住哪里最舒服。",
    icon: "Waves",
    emoji: "🏖️",
    position: 2,
  },
  {
    slug: "city",
    name: "城市探索",
    description: "城市漫步、博物馆与街区生活，把一座城走成自己的路线。",
    icon: "Building2",
    emoji: "🏙️",
    position: 3,
  },
  {
    slug: "food",
    name: "美食之旅",
    description: "市集、路边摊与本地餐厅，按口味规划一座城市的行程。",
    icon: "UtensilsCrossed",
    emoji: "🍜",
    position: 4,
  },
  {
    slug: "outdoors",
    name: "徒步与自然",
    description: "徒步路线、国家公园与露营准备，海拔、天气和体力都要算进去。",
    icon: "Trees",
    emoji: "🥾",
    position: 5,
  },
  {
    slug: "budget",
    name: "省钱攻略",
    description: "怎么在预算内住得好、走得远，交通与订房省钱的真实经验。",
    icon: "PiggyBank",
    emoji: "💰",
    position: 6,
  },
  {
    slug: "companions",
    name: "结伴同行",
    description: "找人一起走一段路，说清时间、预算和节奏再出发。",
    icon: "Users",
    emoji: "🤝",
    position: 7,
  },
];

/** Per-locale board text. `zh-CN` is absent on purpose: the authored Chinese
 *  columns above are the zh-CN values, and duplicating them would let the two
 *  drift apart. */
const BOARD_I18N: Record<
  string,
  { name: Record<string, string>; description: Record<string, string> }
> = {
  ski: {
    name: {
      "zh-TW": "滑雪旅行",
      en: "Ski trips",
      ja: "スキー旅行",
      ko: "스키 여행",
      es: "Viajes de esquí",
    },
    description: {
      "zh-TW": "雪季開板、雪場選擇與裝備經驗，從北海道到阿爾卑斯。",
      en: "Season openings, resort picks and gear notes, from Hokkaido to the Alps.",
      ja: "シーズン初滑り、ゲレンデ選び、装備の経験談。北海道からアルプスまで。",
      ko: "시즌 개장, 슬로프 선택, 장비 노하우. 홋카이도부터 알프스까지.",
      es: "Aperturas de temporada, elección de estación y material, de Hokkaido a los Alpes.",
    },
  },
  beach: {
    name: {
      "zh-TW": "海濱度假",
      en: "Beach holidays",
      ja: "ビーチリゾート",
      ko: "해변 휴양",
      es: "Vacaciones de playa",
    },
    description: {
      "zh-TW": "海島、海灘與潛水，聊季節、潮汐和住哪裡最舒服。",
      en: "Islands, beaches and diving — seasons, tides and where it is nicest to stay.",
      ja: "島、ビーチ、ダイビング。季節や潮汐、泊まって快適な場所の話。",
      ko: "섬, 해변, 다이빙. 계절과 물때, 어디에 묵으면 편한지 이야기합니다.",
      es: "Islas, playas y buceo: temporadas, mareas y dónde alojarse mejor.",
    },
  },
  city: {
    name: {
      "zh-TW": "城市探索",
      en: "City exploring",
      ja: "街歩き",
      ko: "도시 탐험",
      es: "Explorar ciudades",
    },
    description: {
      "zh-TW": "城市漫步、博物館與街區生活，把一座城走成自己的路線。",
      en: "Walks, museums and neighbourhood life — turn a city into your own route.",
      ja: "散歩、博物館、街の暮らし。自分だけのルートに作り替える。",
      ko: "도시 산책, 박물관, 동네 생활. 도시를 나만의 경로로 만들어 보세요.",
      es: "Paseos, museos y vida de barrio: convierte una ciudad en tu propia ruta.",
    },
  },
  food: {
    name: {
      "zh-TW": "美食之旅",
      en: "Food travel",
      ja: "食の旅",
      ko: "미식 여행",
      es: "Viajes gastronómicos",
    },
    description: {
      "zh-TW": "市集、路邊攤與本地餐廳，按口味規劃一座城市的行程。",
      en: "Markets, street stalls and local restaurants — plan a city around what you eat.",
      ja: "市場、屋台、地元の店。食べたいものから街の旅程を組む。",
      ko: "시장, 노점, 현지 식당. 먹고 싶은 것을 기준으로 도시 일정을 짭니다.",
      es: "Mercados, puestos y restaurantes locales: planifica la ciudad según lo que comes.",
    },
  },
  outdoors: {
    name: {
      "zh-TW": "徒步與自然",
      en: "Hiking & nature",
      ja: "トレッキングと自然",
      ko: "트레킹과 자연",
      es: "Senderismo y naturaleza",
    },
    description: {
      "zh-TW": "徒步路線、國家公園與露營準備，海拔、天氣和體力都要算進去。",
      en: "Trails, national parks and camping prep — altitude, weather and stamina all count.",
      ja: "トレイル、国立公園、キャンプ準備。標高・天気・体力まで計算に入れる。",
      ko: "트레일, 국립공원, 캠핑 준비. 고도와 날씨, 체력까지 계산합니다.",
      es: "Rutas, parques nacionales y preparación de acampada: altitud, clima y fuerzas.",
    },
  },
  budget: {
    name: {
      "zh-TW": "省錢攻略",
      en: "Budget travel",
      ja: "節約の知恵",
      ko: "알뜰 여행",
      es: "Viajar con poco",
    },
    description: {
      "zh-TW": "怎麼在預算內住得好、走得遠，交通與訂房省錢的真實經驗。",
      en: "How to stay well and go far on a budget — real notes on transport and booking.",
      ja: "予算内で快適に、遠くへ。交通と宿予約で節約した実体験。",
      ko: "예산 안에서 편하게, 멀리까지. 교통과 숙소 예약 절약 경험담.",
      es: "Alojarse bien y llegar lejos con poco: experiencia real con transporte y reservas.",
    },
  },
  companions: {
    name: {
      "zh-TW": "結伴同行",
      en: "Find companions",
      ja: "同行者募集",
      ko: "동행 구하기",
      es: "Buscar compañeros",
    },
    description: {
      "zh-TW": "找人一起走一段路，說清時間、預算和節奏再出發。",
      en: "Find someone to travel a stretch with — agree on dates, budget and pace first.",
      ja: "一緒に歩く人を探す。日程・予算・ペースを先に決めてから出発。",
      ko: "함께 걸을 사람을 찾습니다. 일정과 예산, 속도를 먼저 맞추고 출발하세요.",
      es: "Encuentra con quién compartir un tramo: acordad fechas, presupuesto y ritmo.",
    },
  },
};

/** The locale keys each board's JSON columns must carry. */
const BOARD_LOCALES = ["zh-TW", "en", "ja", "ko", "es"] as const;

/**
 * Sample forum posts.
 *
 * `daysAgo` is a *relative* offset, turned into a real `createdAt` at insert
 * time, so the seeded forum always has a plausible recency spread instead of
 * every post sharing the moment the seed ran. `replies` are authored in the
 * thread's voice; their own timestamps are derived per post in `buildReplies`.
 *
 * The set is not uniform: `outdoors` gets the newest post while `city` gets the
 * most-replied one, and both a pinned and an unpinned post live in `ski`. That
 * is what makes the three sorts visibly different on first load — a demo where
 * every sort looks identical teaches the reader nothing.
 */
type PostSeed = {
  board: string;
  /** Index into the pool of seeded author accounts. */
  author: number;
  title: string;
  body: string;
  city?: string;
  pinned?: boolean;
  daysAgo: number;
  replies: string[];
};

const POSTS: PostSeed[] = [
  {
    board: "ski",
    author: 0,
    title: "北海道二世谷 12 月雪况怎么样？第一次去需要注意什么",
    body: "计划 12 月中旬去二世谷待 6 天，第一次在日本滑雪，完全没经验。\n想问三件事：一是这个时间雪够不够厚，会不会遇到雪场只开部分缆车；二是从新千岁机场到比罗夫怎么走最省事，租车还是坐巴士；三是第一次滑粉雪，需不需要专门请教练。\n我和朋友都是中级水平，在国内雪场滑了大概三年。",
    // No `city`: 二世谷 is not one of the platform's cities, and tagging it with
    // the nearest one (Tokyo) put a Hokkaido thread under the Tokyo filter.
    daysAgo: 21,
    replies: [
      "12 月中旬二世谷一般已经开了大半，但每年不一样。前年我 12 月 18 号到，山顶还没完全开，山下雪很好。建议出发前一周再看一次雪场官网的缆车运行图。",
      "从新千岁坐巴士最省心，直接到比罗夫欢迎中心，行李也好放。租车的话雪胎是必须的，第一次开雪路压力会比较大。",
      "粉雪和机压雪道完全是两种滑法，建议第一天请半天教练，主要学重心和换刃，后面几天会轻松很多。",
    ],
  },
  {
    board: "ski",
    author: 1,
    title: "滑雪装备：第一次买板，租还是买更划算？",
    body: "滑了三年一直租板，今年想自己买一套。算了一下，一套入门板加固定器加雪鞋大概 6000 左右，国内雪场租一天 150。\n但问题是买了我还得带着走，托运一次不便宜，日本现在好像也开始收超规行李费了。\n想听听大家都是怎么权衡的，尤其是常住南方、一年只滑三四次的情况。",
    daysAgo: 9,
    replies: [
      "一年滑三四次还是租吧，尤其是雪鞋合脚比板重要，租的时候可以让店里帮你调。等你能感觉到不同板的差别了再买。",
      "我的做法是：雪鞋买自己的，板和固定器到了雪场再租。雪鞋合脚是最影响体验的，板反而没那么挑。",
    ],
  },
  {
    board: "ski",
    author: 2,
    title: "崇礼太舞滑雪场周末人多吗？带小孩住哪比较方便",
    body: "想周末带 7 岁的小孩去崇礼玩两天。\n主要顾虑是周末人多，缆车排队会不会很久；另外太舞和云顶哪个对小孩更友好，雪道难度和雪具租赁哪个更省事。\n住宿想住在能走到雪场的地方，预算一晚 800 以内，有没有推荐的镇上或雪场内的酒店。",
    // No `city`: 崇礼 is not a platform city either (it was tagged Kyoto, which
    // is both wrong and confusing next to a Chinese resort name).
    pinned: true,
    daysAgo: 13,
    replies: [
      "周六上午人最多，建议早点上山，或者干脆周日下午再滑，人会少很多。带小孩的话太舞的初级道更宽，教练资源也多。",
      "雪场内的酒店一般贵一些但省事，孩子累了可以直接回房间。太舞小镇上走 10 分钟能到雪具大厅的民宿不少，800 以内能挑到不错的。",
      "提醒一句，1 月的崇礼风大，给小孩准备面罩和防风镜，不然一下午就冻回去了。",
    ],
  },
  {
    board: "beach",
    author: 3,
    title: "普吉岛还是苏梅岛？第一次去泰国海岛求推荐",
    body: "明年 2 月有一个 8 天的假期，第一次去泰国海岛。\n普吉和苏梅在纠结：普吉航班多、方便，但担心太商业化；苏梅要转机、贵一些，据说海水更干净。\n我们主要想浮潜、看日落，不太需要夜生活，住一个不吵的沙滩附近就好。",
    city: "Bangkok",
    daysAgo: 16,
    replies: [
      "只看浮潜和日落，苏梅的查汶北边或波普会更合适，安静也有日落。普吉的话建议避开芭东，去卡塔或奈涵。",
      "2 月是旺季，两边都会涨价。苏梅的机酒组合通常比普吉贵 30% 左右，但岛上节奏确实慢一些。",
    ],
  },
  {
    board: "beach",
    author: 4,
    title: "巴厘岛雨季真的不能去吗？",
    body: "看到很多攻略说 1 月是巴厘岛雨季不要去，但我们的假期只有 1 月中旬。\n想确认一下：雨季是整天都在下雨，还是下午雷阵雨那种？会不会影响出海和浮潜？\n如果只是短暂阵雨，我觉得还是可以去，毕竟机票酒店都便宜不少。",
    daysAgo: 11,
    replies: [
      "通常是一阵一阵的，早上常常是大晴天，下午两三点来一场大雨，下一两个小时就停。带把伞基本能应付。",
      "出海要看船家怎么判断，风浪大的时候确实会取消，建议把出海安排在行程前半段，留出改期的余地。",
      "1 月去的人不少，酒店价格低是真的。唯一要注意的是乌布那边路上会积水，穿防滑的鞋。",
    ],
  },
  {
    board: "city",
    author: 5,
    title: "东京市区 4 天怎么安排？不想每天都在赶路",
    body: "第一次去东京，4 天 3 晚，住在浅草附近。\n主要想去的地方有：浅草寺、上野公园、筑地、涩谷、新宿。\n知道这样安排会很赶，所以想问问怎么分组最合理，最好一天只走一个区域，晚上还能逛逛附近的小店。",
    city: "Tokyo",
    daysAgo: 18,
    replies: [
      "按区域分是对的：第一天浅草加上野（一条线），第二天筑地加银座，第三天涩谷加代官山，第四天新宿。这样每天换乘不超过两次。",
      "浅草晚上去隅田川边走走很舒服，人比白天少很多，还能看到晴空塔亮灯。",
      "筑地要早上去，10 点以后好吃的店就排队很长了。如果起不来，可以放到第二天的早上。",
      "补充一句，涩谷和代官山之间走路要 20 分钟左右，不算近但沿路有意思，走着去比坐车舒服。",
    ],
  },
  {
    board: "city",
    author: 0,
    title: "巴黎博物馆通票值不值得买？",
    body: "在巴黎待 5 天，打算去卢浮宫、奥赛、橘园和凡尔赛。\n算了一下 4 天的通票大概 70 欧，单买的话卢浮宫 22、奥赛 16、凡尔赛 21，加起来差不多。\n主要想知道通票能不能省排队时间，以及凡尔赛是不是必须提前订时段。",
    city: "Paris",
    pinned: true,
    daysAgo: 24,
    replies: [
      "通票最大的价值是省排队，尤其是旺季。卢浮宫和奥赛走通票通道会快很多，但安检还是所有人都要排。",
      "凡尔赛现在进宫殿要预约时段，通票也要单独预约，别以为有票就能直接进。花园不预约也可以进。",
      "橘园很小，一个小时够了，建议放在奥赛同一天，两个地方走路 10 分钟。",
    ],
  },
  {
    board: "food",
    author: 1,
    title: "京都的早市和锦市场，早上去真的值吗？",
    body: "看攻略说锦市场要早上 9 点前去，人少还能吃到刚做好的玉子烧。\n但也有人说现在锦市场早上也很挤，价格偏游客。\n想问问有没有更本地一点的替代选择，比如居民区的商店街，我住在京都站附近。",
    city: "Kyoto",
    daysAgo: 14,
    replies: [
      "锦市场 9 点前去确实舒服，11 点之后就变成人流了。价格确实偏游客，玉子烧 300 日元一串，吃起来主要是氛围。",
      "推荐出町柳的商店街，本地人买菜的地方，有几家老铺的豆饼和饭团非常好吃，价格是锦市场的一半。",
      "如果想吃正经的早餐，京都站附近的咖啡店早上有厚切吐司套餐，500 日元左右，安静又好吃。",
    ],
  },
  {
    board: "food",
    author: 2,
    title: "曼谷路边摊怎么挑才不踩坑，求一点实用的判断方法",
    body: "很喜欢曼谷的路边摊，但肠胃比较敏感，上次去拉了两天。\n想请教一些具体的判断标准，比如看什么信号能判断这家摊子干净、食材新鲜。\n另外想知道哪些菜相对安全、哪些尽量不要在摊子上点。",
    city: "Bangkok",
    daysAgo: 7,
    replies: [
      "最实用的信号是看本地人排不排队，尤其是下班时间来买的人。人多的摊子食材周转快，不容易放坏。",
      "尽量点现场明火现做的，比如炒粉、烤串、冬阴功；少点提前做好摆着卖的凉菜和切好的水果。",
      "冰要留意，正规摊子的冰是工厂冰块，中间有孔；那种一整块敲碎的尽量别加。",
    ],
  },
  {
    board: "outdoors",
    author: 3,
    title: "巴塞罗那周边的徒步路线，一天往返的有推荐吗？",
    body: "在巴塞罗那待一周，想抽一天去山里走走，不想太硬核。\n看到蒙特塞拉特可以坐缆车上去再走，也有人说提比达波山就能走到。\n想找一条 4 到 5 小时、交通方便、风景好的路线，最好是能自己走不用请向导的。",
    city: "Barcelona",
    daysAgo: 19,
    replies: [
      "蒙特塞拉特最省事，火车加缆车直接到山顶，上面有几条标注清楚的步道，2 到 4 小时都有。风景是那种奇石山，很特别。",
      "提比达波从市区坐缆车上山，然后沿着山脊往下走到巴尔迪维德罗修道院，再坐公交下山，大概 4 小时，能看到整座城市和海。",
      "提醒一下，夏天那边下午很晒，山上没有太多树荫，水要带够。",
    ],
  },
  {
    board: "outdoors",
    author: 4,
    title: "悉尼蓝山一日徒步，怎么坐车最顺？",
    body: "住在悉尼市中心，想去蓝山走一天，看三姐妹峰和瀑布。\n查了一下火车大概两个小时到卡通巴，但到了之后去各个观景点的交通不太清楚。\n想问问有没有公交或者步道可以从火车站直接走到主要观景点，以及一天时间够不够走完。",
    city: "Sydney",
    daysAgo: 6,
    replies: [
      "卡通巴站出来有 686 路公交，直接到回声角和景观世界，买一张日票可以随便坐，很方便。",
      "一天走完三姐妹峰加景观世界的步道是可以的，但会很满。建议只选一条长步道，比如大阶梯下到谷底再坐缆车上来。",
    ],
  },
  {
    board: "budget",
    author: 5,
    title: "长住一个月怎么订房最省钱？有没有比酒店更好的选择",
    body: "明年打算在东京住一个月，边远程办公边旅行。\n在平台上看整月订的公寓，价格比按周订便宜一些，但还是要 8000 左右。\n想知道有没有更省的方式，比如周租公寓、share house，或者直接联系房东谈月租。这种谈价一般怎么开口比较自然？",
    city: "Tokyo",
    daysAgo: 23,
    replies: [
      "月租最省的是周租公寓和 share house，东京有不少专门做月租的公司，比平台便宜 30% 到 40%，但通常要押金和简单审核。",
      "直接问房东是可以的，尤其是淡季。开口就说清楚住一个月、日期确定、会自己打扫，很多房东愿意给九折或者免清洁费。",
      "远程办公记得确认网速，有些老房子的网络是共享的，白天开会会卡。看房时问一句是不是光纤独享。",
    ],
  },
  {
    board: "companions",
    author: 0,
    title: "11 月有人一起去尼泊尔走 ABC 吗？行程大概 10 天",
    body: "计划 11 月初走安纳普尔纳大本营线，10 天左右，从博卡拉出发。\n今年的打算是请一个向导但不背夫，自己背包，节奏偏慢，每天走 5 到 6 小时就停。\n想找一两个同伴，最好是走过高原徒步、能接受山上住宿条件一般的人。预算和装备可以私聊细聊。",
    daysAgo: 5,
    replies: [
      "11 月天气很稳，是那条线最好的时间。建议把行程多留一天当机动，山上因为天气延误很常见。",
      "我在尼泊尔走过 EBC，提醒一下 11 月早晚温差非常大，睡袋建议标温 -10 度的，客栈的被子不太够。",
    ],
  },

  // ---------------------------------------------------------------------------
  // A second wave of samples, added after the first version shipped, so every
  // board has enough threads to look alive when the board filter is used — a
  // board with a single post makes the filter look broken rather than quiet.
  // These were inserted by the per-post idempotency rule above; under the old
  // per-board rule none of them would ever have appeared.
  // ---------------------------------------------------------------------------

  // ---- ski
  {
    board: "ski",
    author: 3,
    title: "白马和志贺高原怎么选？从东京出发的雪道与交通对比",
    body: "2 月想去长野滑一周，从东京进出，在白马和志贺高原之间拿不定主意。\n白马是一个村多个雪场，海拔落差大，听说野雪和树林很好；志贺是一张通票滑十几个雪场，但雪场之间要坐巴士。\n我滑了四五年，能下黑道但不下蘑菇，同行的人偏中级。想听听两边都去过的人怎么评价。",
    city: "Tokyo",
    daysAgo: 17,
    replies: [
      "从东京坐新干线到长野站再转巴士，白马和志贺都方便。想省事选志贺，通票覆盖的雪场多，天气不好也有替代；想滑得爽选白马。",
      "志贺的雪场之间巴士班次不多，尤其下午，回程要看好时刻表，不然只能在雪场门口等。白马村内倒是有免费穿梭巴士。",
      "你们这个水平我建议白马，八方尾根的中级道很长，一天滑下来很过瘾。志贺的话挑一两个大雪场深度滑更合适。",
    ],
  },
  {
    board: "ski",
    author: 4,
    title: "欧洲滑雪：法国三山谷值不值得专程去一趟",
    body: "在看明年 3 月的欧洲滑雪，巴黎转机，考虑法国的三山谷。\n价格比日本贵不少，雪票一天要 60 多欧，住宿也不便宜。\n想确认一下：3 月的雪况稳不稳，世界最大滑雪区到底「大」在哪里，以及从巴黎过去是不是真的要好几个小时。",
    daysAgo: 30,
    replies: [
      "3 月雪况通常还很好，而且日照长、下午雪软，滑起来比 1 月舒服。缺点是部分低海拔的回程道会开始化。",
      "巴黎到三山谷没有直达高铁，一般是高铁到尚贝里或里昂再转大巴，全程五六个小时，别低估这一段。",
      "它的大在于雪道把几个村子连成一片，可以一天从法国滑到意大利又滑回来，但如果你只待三四天，其实滑不完，不如选一个区深度玩。",
    ],
  },

  // ---- beach
  {
    board: "beach",
    author: 2,
    title: "普吉岛和甲米选哪个？第一次去泰国海岛",
    body: "第一次去泰国海岛，7 天左右，从曼谷转机。\n看照片普吉更热闹、设施全，甲米更安静、能看石灰岩山。\n我们两个人，不打算出海太多天，主要想找一片水清、人不太挤的海滩住几天，晚上能吃到好海鲜就行。纠结的地方是普吉会不会太商业化。",
    city: "Bangkok",
    daysAgo: 26,
    replies: [
      "普吉确实商业，但换个角度就是方便：医院、餐厅、包车都好找。想避开人多就别住芭东，往卡塔和奈涵走。",
      "甲米更适合你们这种想安静的，奥南和莱莱都行。莱莱没有公路，进出靠长尾船，行李多会有点麻烦。",
      "海鲜两边都不错，但甲米的夜市更便宜。提醒一句雨季出海要看清天气，很多一日游照样发船。",
    ],
  },
  {
    board: "beach",
    author: 6,
    title: "巴塞罗那附近的海滩，一天往返够玩吗",
    body: "在巴塞罗那待五天，想抽一天去海边，不打算过夜。\n市区本身就有海滩，但听说人多且沙子一般；也看到有人推荐坐近郊火车去锡切斯或布拉瓦海岸。\n想问问一天往返到底值不值，来回路上大概要多久，以及 5 月下水会不会太冷。",
    city: "Barcelona",
    daysAgo: 15,
    replies: [
      "市区海滩胜在方便，走几步就到，但 5 月的水还是偏凉，游泳的人不多，晒晒太阳正好。",
      "去锡切斯坐火车大概 40 分钟一班，很方便，小镇本身也好看，一天往返完全够，比市区海滩舒服。",
      "如果只想下水，建议等到 6 月底之后；5 月去海边更适合散步和吃海鲜饭。",
    ],
  },

  // ---- city
  {
    board: "city",
    author: 1,
    title: "首尔三天怎么安排？第一次去不想太赶",
    body: "第一次去首尔，只有三天，住在明洞附近。\n想去的地方有景福宫、北村、弘大、江南，但看起来分布挺散。\n不想每天赶路，宁愿少去两个地方、把一处逛透。想请教一下三天怎么排比较顺，以及地铁换乘是不是真的要走很久。",
    city: "Seoul",
    daysAgo: 11,
    replies: [
      "三天的话建议一天一个片区：景福宫加北村加仁寺洞一天，弘大加延南洞一天，江南加汉江公园一天。这样几乎不跨城。",
      "换乘确实有要走很久的站，比如首尔站和高速巴士客运站，留出十分钟比较稳。用 T-money 卡最省事。",
      "明洞购物方便但吃的不算最好，可以往乙支路和广藏市场走一走，本地小吃更多也更便宜。",
    ],
  },
  {
    board: "city",
    author: 5,
    title: "新加坡四天，除了滨海湾还有什么值得去",
    body: "在新加坡四天，带父母，节奏要慢。\n滨海湾、鱼尾狮、植物园这些肯定会去。\n想再加一些「不像旅游团」的地方，比如老街区、市场、或者能坐着发呆的公园。另外想问问 4 月是不是真的很闷热，需要怎么安排时间。",
    city: "Singapore",
    daysAgo: 8,
    replies: [
      "带父母推荐加一个加东和如切的老街区，娘惹建筑很好看，吃的也地道，走路不多。",
      "4 月基本是全年前后最热的时候，午后常有雷阵雨。建议上午出门、中午回酒店休息、傍晚再出去。",
      "可以安排半天去南部山脊步道，海拔不高、有树荫，从花柏山走到直落布兰雅，中间有缆车和观景台。",
    ],
  },

  // ---- food
  {
    board: "food",
    author: 0,
    title: "筑地场外市场几点去合适？想吃寿司又怕排队",
    body: "早上想去筑地场外市场，主要是吃海鲜和玉子烧。\n看了几篇攻略，有人说六点去最好，也有人说九点之后人少一些。\n想确认一下：名店大概几点开始排队，两点以后还有没有的吃，以及场内市场搬走之后外场还值不值得专门跑一趟。",
    city: "Tokyo",
    daysAgo: 19,
    replies: [
      "想吃热门的那几家，7 点前到比较稳，8 点以后队伍就绕出去了。玉子烧和海鲜丼的小店反而不用排太久。",
      "外场还是很值得去，场内搬走的是拍卖和批发，外场的店基本都留着。中午之后有些店会卖完收摊，别拖到下午。",
      "提醒一句很多店周三或周日休，出发前查一下，不然白跑。",
    ],
  },
  {
    board: "food",
    author: 4,
    title: "悉尼有什么本地人常吃的地方推荐吗",
    body: "在悉尼待一周，不想顿顿吃游客区。\n听说鱼市场要早去，还有人说真正的日常美食在郊区的越南城和唐人街。\n想找一些人均不太贵、能吃到本地日常的店，早中晚都可以。另外澳洲的咖啡是不是真的随便一家都好喝？",
    city: "Sydney",
    daysAgo: 13,
    replies: [
      "咖啡基本不用挑，社区里的咖啡馆普遍比连锁好。Flat white 是本地日常，可以当早饭配个牛角包。",
      "想吃便宜的往 Bankstown 和 Cabramatta 走，越南粉和烤肉米线又便宜又好。市区的话 Haymarket 一带晚上很热闹。",
      "鱼市场尽量 10 点前到，晚了旅行团一来就很挤。买完可以拿到外面坐着吃，注意海鸥会抢。",
    ],
  },

  // ---- outdoors
  {
    board: "outdoors",
    author: 3,
    title: "京都周边的赏枫徒步线，11 月哪条最合适",
    body: "11 月下旬去京都，想安排两天在城外走山路，顺便看红叶。\n知道有高雄、大原、比叡山这些方向，但不确定哪条既能看红叶又不至于太累。\n同行的人平时有运动，但不想走夜路，希望下午四点前能回到市区。",
    city: "Kyoto",
    daysAgo: 22,
    replies: [
      "推荐高雄三寺那条，从神护寺走到高山寺，红叶密集、坡度缓，半天就能走完，公交回市区也方便。",
      "比叡山可以坐缆车上、走下来，省力又能看全景，但下山的路有些台阶湿滑，11 月落叶多要小心。",
      "11 月下旬京都天黑得早，四点半就开始暗了，尽量把行程往前压，别安排太晚。",
    ],
  },
  {
    board: "outdoors",
    author: 6,
    title: "纽约附近有适合新手的徒步吗？不想租车",
    body: "在纽约待十天，想抽两天走走路，最好坐公共交通能到。\n看到有人推荐冷泉镇和熊山，也有人说不租车基本去不了。\n我平时会走路但不算常爬山，一次走 8 到 10 公里可以接受，想找路况清楚、有退路的路线。",
    city: "New York",
    daysAgo: 6,
    replies: [
      "熊山有火车直达，站外就有接驳，从市区一个多小时。环湖那条路很平缓，适合第一次去。",
      "冷泉镇更适合散步而不是徒步，小镇本身很可爱，爬断颈岭那段稍微费点力但也有台阶。",
      "不租车完全可行，Metro-North 周末有套票，含火车和景点门票，比单买便宜。冬天注意防滑。",
    ],
  },

  // ---- budget
  {
    board: "budget",
    author: 2,
    title: "同一家房源在不同渠道差多少钱？怎么比价",
    body: "发现同一套公寓在平台、酒店官网和另外两个渠道上的价格不一样，有的差一两百。\n想搞清楚这些差价一般出在哪里：是服务费、税费，还是会员价。\n另外想问问有没有必要为了几天的住宿到处比价，还是直接订省心。",
    daysAgo: 27,
    replies: [
      "差价主要来自三块：平台服务费、税费展示方式（有的把税藏到最后一步）、以及是否含早餐或清洁费。把总价拉到最后一步再比才有意义。",
      "短住三天以内我一般不折腾，差不出多少。住五天以上值得比一比，尤其是官网直订经常免服务费。",
      "提醒一下官网直订要看清取消政策，很多低价房型是不可退的，通过平台反而更宽松。",
    ],
  },
  {
    board: "budget",
    author: 5,
    title: "红眼航班省下来的钱，值不值多住一晚酒店",
    body: "在纠结机票：红眼比白天航班便宜 600 左右，但凌晨到，机场到市区的地铁还没开。\n算下来可能要在机场等到早上，或者多订一晚酒店，那省的钱就没了。\n想听听大家的实际经验，尤其是带家人出行的情况。",
    daysAgo: 10,
    replies: [
      "一个人我可以接受在机场等，带家人就算了，孩子睡不好第二天全废。省 600 花 400 订一晚，其实没省。",
      "有些机场有按小时计费的休息舱或胶囊旅馆，比订一晚酒店便宜，三四个小时也能睡一觉，可以查一下。",
      "还要算上打车，凌晨到市区打车经常比地铁贵好几倍，这样一算红眼就完全不划算了。",
    ],
  },
  {
    board: "budget",
    author: 4,
    title: "伦敦住宿太贵，住周边通勤划算吗",
    body: "去伦敦一周，市区住宿一晚要一千多。\n看到有人住到郊区的通勤镇，火车半小时进市区，价格能便宜一半。\n想确认一下：通勤票贵不贵、晚上回程安不安全，以及这样每天路上花的时间会不会把旅行的乐趣耗掉。",
    city: "London",
    daysAgo: 4,
    replies: [
      "通勤票可以买周票，摊下来一天没多少，但要看清是哪个区，跨区加价挺明显。刷银行卡进出站会自动算上限，比买单程票划算。",
      "安全上问题不大，就是末班车比较早，晚上看完剧要赶车，别安排太晚的活动。",
      "每天来回一小时，一周下来就是半天。我后来宁愿住市区小一点的房间，也不想把时间花在车上。",
    ],
  },

  // ---- companions
  {
    board: "companions",
    author: 1,
    title: "1 月中旬在东京看展，有人一起吗",
    body: "1 月中旬会在东京待五天，主要看几个美术馆的特展，行程比较松。\n一个人逛展有点闷，想找人一起，也可以只是某一天同行。\n我住在上野附近，白天看展、晚上找居酒屋，节奏很慢，不赶景点。",
    city: "Tokyo",
    daysAgo: 3,
    replies: [
      "上野那一带美术馆密集，一天看两个刚好，看三个会完全记不住。建议按展期排一下顺序。",
      "1 月是淡季，很多展不用预约，但热门的还是建议提前买指定时间的票。",
    ],
  },
  {
    board: "companions",
    author: 6,
    title: "春节想去巴黎，找人拼房或者一起吃年夜饭",
    body: "春节假期去巴黎待六天，一个人，住宿想找人拼一间双床房，能省不少。\n另外除夕那天想找中餐馆吃顿饭，一个人点菜不太方便。\n我作息正常、爱干净，白天各玩各的也行，主要是住宿和吃饭有个伴。",
    city: "Paris",
    daysAgo: 2,
    replies: [
      "春节那几天巴黎的中餐厅会很满，建议提前两周订位，尤其是十三区那一带。",
      "拼房记得提前说清作息和是否介意打呼，不然住一起比一个人还累。",
    ],
  },
  {
    board: "companions",
    author: 3,
    title: "5 月悉尼，想找人一起自驾蓝山",
    body: "5 月上旬在悉尼，计划抽一天自驾去蓝山，看三姐妹峰和几个观景台。\n一个人租车不划算，也想有人换着开、帮忙看导航。\n我有国际驾照和三年驾龄，路线已经大致查过，早出晚归一天能走完。",
    city: "Sydney",
    daysAgo: 1,
    replies: [
      "蓝山一天够，但要早出发，市区过去大概一个半小时。下午山里起雾很快，观景台要赶在两点前。",
      "5 月山上比市区冷不少，带件外套。另外几个观景台的停车场很小，周末容易没位。",
    ],
  },
];

/**
 * Reply timestamps for one post, derived from the post's own age.
 *
 * The offsets are deterministic (first reply soonest, later replies later) and
 * never exceed the post's age, so a reply can never be older than the post it
 * answers — which would make the "latest activity" sort quietly wrong on the
 * seeded data. The first offset is large enough that the newest reply *inside* a
 * post still lands after some other post's `createdAt`, which is what makes the
 * `latest` and `new` sorts distinguishable at all.
 */
function buildReplies(post: PostSeed): Array<{ body: string; createdAt: Date }> {
  const offsets = [4, 3, 2, 4, 3, 2];

  return post.replies.map((body, index) => {
    const offset = Math.max(1, Math.min(post.daysAgo - 1, offsets[index % offsets.length]));
    return { body, createdAt: new Date(Date.now() - offset * 86_400_000) };
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
  for (const host of HOSTS) {
    hosts.push(
      await prisma.user.upsert({
        where: { email: host.email },
        create: {
          email: host.email,
          name: host.name,
          password: passwordHash,
          avatar: presetAvatarFor(host.email),
        },
        // Keep the password as-is so a changed demo password is not reset.
        update: { name: host.name, avatar: presetAvatarFor(host.email) },
      }),
    );
  }

  const demoUser = await prisma.user.upsert({    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      name: "演示用户",
      password: passwordHash,
      avatar: presetAvatarFor(DEMO_EMAIL),
    },
    // Deliberately empty: this must not overwrite anything the user changed.
    update: {},
  });

  // One-time migration: avatars used to come from i.pravatar.cc, which now
  // answers 403 to every request, so those accounts show a broken image. Point
  // them at the bundled presets — but only where the URL is still the legacy
  // one, so a deliberately chosen avatar is never replaced.
  const legacyAvatars = await prisma.user.findMany({
    where: { avatar: { contains: "pravatar" } },
    select: { id: true, email: true },
  });
  for (const user of legacyAvatars) {
    await prisma.user.update({
      where: { id: user.id },
      data: { avatar: presetAvatarFor(user.email) },
    });
  }
  if (legacyAvatars.length > 0) {
    console.log(`[seed] migrated ${legacyAvatars.length} legacy avatar(s) to bundled presets`);
  }

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
      // Chosen once so the Chinese title and every localised title agree on the
      // same adjective and walking distance.
      const chosenAdj = pick(ADJECTIVES);
      const chosenWalk = intBetween(2, 9);
      const title = buildTitle(city, neighborhood, shape, usedTitles, chosenAdj, chosenWalk);
      const localized = buildLocalizedListingText({
        neighborhood,
        city: city.name,
        cityZh: city.nameZh,
        propertyType: shape.propertyType,
        adjective: chosenAdj,
        walk: chosenWalk,
        guests: shape.maxGuests,
        variant: s,
      });

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
        ...buildHouseRules(shape, amenityNames),
        // The Chinese title goes LAST: the generated map already carries a
        // `zh-CN` key (empty), so spreading it afterwards blanks the value.
        titleI18n: { ...localized.titleI18n, "zh-CN": title },
        locationI18n: localized.locationI18n,
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

  // ---------------------------------------------------------------- reviews
  //
  // Upserted by (listingId, userId) so re-running the seed refreshes the text
  // instead of stacking duplicates — and reviews written by real users are never
  // touched, because those user ids are not in REVIEWERS.
  console.log("[seed] guest reviewers + reviews (upsert) ...");
  const reviewers: Array<{ id: string }> = [];
  for (const reviewer of REVIEWERS) {
    reviewers.push(
      await prisma.user.upsert({
        where: { email: reviewer.email },
        create: {
          email: reviewer.email,
          name: reviewer.name,
          password: passwordHash,
          avatar: presetAvatarFor(reviewer.email),
        },
        update: { name: reviewer.name, avatar: presetAvatarFor(reviewer.email) },
      }),
    );
  }

  const allListings = await prisma.listing.findMany({
    select: { id: true, hostId: true },
    orderBy: { id: "asc" },
  });

  let reviewCount = 0;
  for (const listing of allListings) {
    // 1-3 reviews each, deterministic, never by the listing's own host.
    const eligible = reviewers.filter((reviewer) => reviewer.id !== listing.hostId);
    const howMany = Math.min(eligible.length, intBetween(1, 3));

    for (let i = 0; i < howMany; i++) {
      // Deterministic spread: a small char-code hash of the id, so different
      // listings get different reviewers instead of all sharing the first one.
      const hash = [...listing.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
      const reviewer = eligible[(hash + i * 3) % eligible.length];
      const template = pick(REVIEW_WITH_SCORES);
      // Spread the timestamps so the list has a believable order.
      const createdAt = new Date(Date.now() - intBetween(1, 240) * 86_400_000);

      await prisma.review.upsert({
        where: { listingId_userId: { listingId: listing.id, userId: reviewer.id } },
        create: {
          listingId: listing.id,
          userId: reviewer.id,
          rating: template.rating,
          comment: template.comment,
          createdAt,
        },
        update: { rating: template.rating, comment: template.comment },
      });
      reviewCount++;
    }
  }
  console.log(`[seed] reviews: ${reviewCount} across ${allListings.length} listings`);

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

  // ----------------------------------------------------------------- forum
  //
  // Boards are upserted by `slug`, the same way listings are upserted by
  // `seedKey`: the row's id — and therefore every post's `boardId` — survives a
  // re-seed, so refreshing a board's wording never orphans a discussion.
  console.log("[seed] forum boards (upsert by slug) ...");
  for (const board of BOARDS) {
    const text = BOARD_I18N[board.slug];
    const nameI18n: Record<string, string> = { "zh-CN": board.name };
    const descriptionI18n: Record<string, string> = { "zh-CN": board.description };
    for (const locale of BOARD_LOCALES) {
      const name = text?.name[locale];
      const description = text?.description[locale];
      // A missing translation would render the key's absence as Chinese in an
      // English UI, so fail the seed loudly instead of writing a half-filled map.
      if (!name || !description) {
        throw new Error(`[seed] board "${board.slug}" is missing the ${locale} translation`);
      }
      nameI18n[locale] = name;
      descriptionI18n[locale] = description;
    }

    await prisma.board.upsert({
      where: { slug: board.slug },
      create: {
        slug: board.slug,
        name: board.name,
        description: board.description,
        nameI18n,
        descriptionI18n,
        icon: board.icon,
        emoji: board.emoji,
        position: board.position,
      },
      update: {
        name: board.name,
        description: board.description,
        nameI18n,
        descriptionI18n,
        icon: board.icon,
        emoji: board.emoji,
        position: board.position,
      },
    });
  }
  const boardRows = await prisma.board.findMany({ select: { id: true, slug: true } });
  const boardIdBySlug = new Map(boardRows.map((board) => [board.slug, board.id]));

  /**
   * Sample posts — **idempotency, and why it looks like this.**
   *
   * `Post` has no unique key to upsert on, so a re-run has to decide for itself
   * what "already seeded" means. The rule is per **post**, matched on
   * `(boardId, title)` — unique among the samples:
   *
   *  1. A sample whose `(board, title)` already exists is skipped, so a second
   *     run inserts nothing: no duplicate threads. Replies likewise: a post that
   *     already has replies is left alone, so `replyCount` cannot be driven up by
   *     re-seeding.
   *  2. A **missing** board is refilled. A freshly migrated database has no
   *     boards, and a forum that stays empty after `npm run db:seed` would be a
   *     broken demo.
   *
   * This started out as "a board that already holds any post is skipped
   * entirely", which is coarser and has a bad consequence: **adding a new sample
   * to an existing board could never take effect**, because the board was
   * already non-empty. Matching per post means the sample list can grow and the
   * next `db:seed` simply inserts what is missing.
   *
   * The remaining consequence, stated plainly: deleting a sample post and then
   * re-seeding brings that one thread back. Posts are demo content with no owner
   * and no way to mark them as seeded, and this is the trade-off that keeps both
   * "never duplicate" and "never empty" true at the same time. Nothing is ever
   * *deleted* by this section, and a real user's own thread is untouched because
   * only titles in the sample list are ever considered.
   */
  const authorEmails = [
    ...HOSTS.map((host) => host.email),
    ...REVIEWERS.map((reviewer) => reviewer.email),
    DEMO_EMAIL,
  ];
  const authorRows = await prisma.user.findMany({
    where: { email: { in: authorEmails } },
    select: { id: true, email: true },
  });
  const authorIdByEmail = new Map(authorRows.map((user) => [user.email, user.id]));
  const authors = authorEmails
    .map((email) => authorIdByEmail.get(email))
    .filter((id): id is string => Boolean(id));
  if (authors.length === 0) throw new Error("[seed] no seeded accounts available to author posts");

  const existingSamples = await prisma.post.findMany({
    where: { title: { in: POSTS.map((post) => post.title) } },
    select: { boardId: true, title: true },
  });
  const existingKeys = new Set(
    existingSamples.map((post) => `${post.boardId}:${post.title}`),
  );

  console.log("[seed] forum sample posts ...");
  let createdPosts = 0;
  let refreshedPosts = 0;
  const samplesByBoard = new Map<string, PostSeed[]>();
  for (const post of POSTS) {
    const bucket = samplesByBoard.get(post.board) ?? [];
    bucket.push(post);
    samplesByBoard.set(post.board, bucket);
  }

  for (const [slug, samples] of samplesByBoard) {
    const boardId = boardIdBySlug.get(slug);
    if (!boardId) {
      // A typo in POSTS would otherwise show up as a silently smaller forum.
      throw new Error(`[seed] post references unknown board "${slug}"`);
    }

    const missing = samples.filter((post) => !existingKeys.has(`${boardId}:${post.title}`));

    if (missing.length > 0) {
      await prisma.post.createMany({
        data: missing.map((post) => ({
          boardId,
          authorId: authors[post.author % authors.length],
          title: post.title,
          body: post.body,
          city: post.city ?? null,
          pinned: post.pinned ?? false,
          createdAt: new Date(Date.now() - post.daysAgo * 86_400_000),
        })),
      });
      createdPosts += missing.length;
    }

    // Content of the samples that already exist is refreshed, so the seed source
    // and the database converge instead of silently drifting apart.
    //
    // This was a real bug, not a hypothetical: a sample had `city: "Kyoto"` on a
    // thread about 崇礼, and deleting that line changed nothing in an already
    // seeded database — the wrong tag stayed on the card. Same reasoning as the
    // listing upsert: the seed owns the *content* of its demo rows, while their
    // ids survive so replies, bookmarks and orders attached to them are safe.
    // `createdAt` and `replyCount` are deliberately NOT touched: the first is
    // part of the row's identity in the list, the second is owned by the replies.
    const present = samples.filter((post) => existingKeys.has(`${boardId}:${post.title}`));
    for (const post of present) {
      await prisma.post.updateMany({
        where: { boardId, title: post.title },
        data: {
          body: post.body,
          city: post.city ?? null,
          pinned: post.pinned ?? false,
          authorId: authors[post.author % authors.length],
        },
      });
      refreshedPosts++;
    }
  }

  // Replies next, matched by (boardId, title) — unique among the samples — so the
  // rows above can carry the thread's text while the denormalised `replyCount` is
  // written from the number of replies that were actually inserted.
  console.log("[seed] forum sample replies ...");
  let createdReplies = 0;
  const allBoardIds = [...boardIdBySlug.values()];
  const samplePosts = await prisma.post.findMany({
    where: {
      boardId: { in: allBoardIds },
      title: { in: POSTS.map((post) => post.title) },
    },
    select: { id: true, boardId: true, title: true, replyCount: true },
  });

  // A post that already has replies is left alone: it has either been seeded
  // before or been answered by a real user, and neither should be added to.
  const answeredIds = new Set(
    (
      await prisma.reply.findMany({ where: { postId: { in: samplePosts.map((p) => p.id) } }, select: { postId: true } })
    ).map((reply) => reply.postId),
  );

  // The samples are keyed by (board slug, title) — unique among them — so the
  // thread's own text stays the lookup key and nothing depends on insertion order.
  // The reverse map lets a row's `boardId` be turned back into its slug.
  const sampleByTitleAndBoard = new Map(
    POSTS.map((post) => [`${post.board}:${post.title}`, post]),
  );
  const slugByBoardId = new Map([...boardIdBySlug.entries()].map(([slug, id]) => [id, slug]));

  for (const row of samplePosts) {
    if (answeredIds.has(row.id)) continue;
    const sample = sampleByTitleAndBoard.get(`${slugByBoardId.get(row.boardId)}:${row.title}`);
    if (!sample) continue;

    const replies = buildReplies(sample);
    await prisma.$transaction(async (tx) => {
      await tx.reply.createMany({
        data: replies.map((reply) => ({
          postId: row.id,
          authorId: authors[(sample.author + 1) % authors.length],
          body: reply.body,
          createdAt: reply.createdAt,
        })),
      });
      // Written as an absolute value, not an increment: this is a fresh insert
      // whose exact size is known, so the counter ends up equal to the number of
      // rows just created even if the column started out wrong.
      await tx.post.update({ where: { id: row.id }, data: { replyCount: replies.length } });
    });
    createdReplies += replies.length;
  }

  const [boardCount, postCount, replyTotal] = await Promise.all([
    prisma.board.count(),
    prisma.post.count(),
    prisma.reply.count(),
  ]);
  console.log(
    `[seed] forum: ${boardCount} boards, ${postCount} posts (+${createdPosts} this run, ` +
      `${refreshedPosts} refreshed), ${replyTotal} replies (+${createdReplies} this run)`,
  );

  // ------------------------------------------------------------------ social
  /**
   * A small, deliberate social graph around the demo account.
   *
   * Without this the Friends page and every profile are empty on a fresh
   * database, so the feature can only be demoed by registering a second account
   * by hand. Seeded as: two accepted friends, one request waiting for the demo
   * user to answer, and one the demo user has sent — which is exactly the three
   * sections the page renders.
   *
   * Idempotent: the pair is upserted on the unique (requester, addressee), and
   * the reverse direction is checked first so a re-run cannot create a mirrored
   * duplicate of the same friendship.
   */
  const [friendA, friendB, asker, target] = hosts;
  if (friendA && friendB && asker && target) {
    const pairs: Array<{ requesterId: string; addresseeId: string; status: "ACCEPTED" | "PENDING"; respondedAt: Date | null }> = [
      { requesterId: demoUser.id, addresseeId: friendA.id, status: "ACCEPTED", respondedAt: new Date() },
      { requesterId: friendB.id, addresseeId: demoUser.id, status: "ACCEPTED", respondedAt: new Date() },
      // Incoming: the demo user is the addressee, so it shows up as "accept or
      // decline" rather than as something already done.
      { requesterId: asker.id, addresseeId: demoUser.id, status: "PENDING", respondedAt: null },
      // Outgoing: still pending, so the demo user can also see the waiting state.
      { requesterId: demoUser.id, addresseeId: target.id, status: "PENDING", respondedAt: null },
    ];

    let createdFriendships = 0;
    for (const pair of pairs) {
      const mirrored = await prisma.friendship.findUnique({
        where: {
          requesterId_addresseeId: {
            requesterId: pair.addresseeId,
            addresseeId: pair.requesterId,
          },
        },
        select: { id: true },
      });
      if (mirrored) continue;

      const existing = await prisma.friendship.findUnique({
        where: {
          requesterId_addresseeId: {
            requesterId: pair.requesterId,
            addresseeId: pair.addresseeId,
          },
        },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.friendship.create({ data: pair });
      createdFriendships++;
    }

    const friendTotal = await prisma.friendship.count();
    console.log(`[seed] social: ${friendTotal} friendship row(s) (+${createdFriendships} this run)`);
  }

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
