/**
 * Bridges stored data values to translation keys.
 *
 * Three kinds of value come out of the database or the type system rather than
 * from JSX: property types, sort options, and amenity names. Each needs a stable
 * key so the label can be translated without translating the data itself.
 *
 * The amenity mapping is a plain lookup verified against the catalogue by
 * `scripts/verify-i18n.ts` — adding an amenity without a label fails the test
 * instead of silently rendering an untranslated Chinese name.
 */
import type { Translate } from "@/lib/i18n";
import type { PropertyTypeValue, SortOption } from "@/types";

/** Property types are an enum with known members, so the slug is the member. */
export function propertyTypeLabel(t: Translate, value: PropertyTypeValue): string {
  return t(`propertyType.${value}` as Parameters<Translate>[0]);
}

const SORT_KEYS: Record<SortOption, string> = {
  recommended: "sort.recommended",
  price_asc: "sort.priceAsc",
  price_desc: "sort.priceDesc",
  rating_desc: "sort.ratingDesc",
};

export function sortLabel(t: Translate, option: SortOption): string {
  return t(SORT_KEYS[option] as Parameters<Translate>[0]);
}

/** Stored amenity name -> dictionary slug. Must cover every `AMENITY_CATALOG` name. */
export const AMENITY_I18N_KEY: Record<string, string> = {
  无线网络: "wifi",
  厨房: "kitchen",
  空调: "airConditioning",
  暖气: "heating",
  洗衣机: "washer",
  电视: "tv",
  专用办公区: "workspace",
  熨斗: "iron",
  吹风机: "hairDryer",
  热水: "hotWater",
  浴缸: "bathtub",
  游泳池: "pool",
  健身房: "gym",
  阳台: "balcony",
  花园: "garden",
  烧烤设备: "bbq",
  免费停车: "freeParking",
  电梯: "elevator",
  地铁附近: "nearSubway",
  含早餐: "breakfast",
  自助入住: "selfCheckIn",
  可带宠物: "petsAllowed",
  长租可议: "longTermStays",
  婴儿床: "crib",
  烟雾报警器: "smokeAlarm",
  一氧化碳报警器: "carbonMonoxideAlarm",
};

/**
 * Translate an amenity by its stored name.
 * Falls back to the stored name so an unmapped amenity is still readable.
 */
export function amenityLabel(t: Translate, storedName: string): string {
  const slug = AMENITY_I18N_KEY[storedName];
  if (!slug) return storedName;
  return t(`amenities.${slug}` as Parameters<Translate>[0]);
}

/** `WeatherKind` is a closed set, so the slug is the kind itself. */
const WEATHER_KIND_KEY: Record<string, string> = {
  clear: "weather.kind.clear",
  "mostly-clear": "weather.kind.mostlyClear",
  "partly-cloudy": "weather.kind.partlyCloudy",
  overcast: "weather.kind.overcast",
  fog: "weather.kind.fog",
  drizzle: "weather.kind.drizzle",
  rain: "weather.kind.rain",
  "freezing-rain": "weather.kind.freezingRain",
  snow: "weather.kind.snow",
  showers: "weather.kind.showers",
  "snow-showers": "weather.kind.snowShowers",
  thunderstorm: "weather.kind.thunderstorm",
  unknown: "weather.kind.unknown",
};

/**
 * Weather condition label. Falls back to the server's prose description when the
 * kind is one we have no key for, so a new provider code never renders blank.
 */
export function weatherKindLabel(t: Translate, kind: string, fallback: string): string {
  const key = WEATHER_KIND_KEY[kind];
  return key ? t(key as Parameters<Translate>[0]) : fallback;
}

/**
 * Advice line for a weather reading, built from `adviceKeys`.
 * `adviceKeys` is the translatable form; `advice` is the server's prose and is
 * used only when keys are absent (e.g. an older cached payload).
 */
export function weatherAdviceLabel(
  t: Translate,
  weather: { adviceKeys?: string[]; advice: string },
  separator = "，",
): string {
  const keys = weather.adviceKeys ?? [];
  if (keys.length === 0) return weather.advice;
  return keys.map((key) => t(`weather.tip.${key}` as Parameters<Translate>[0])).join(separator);
}
