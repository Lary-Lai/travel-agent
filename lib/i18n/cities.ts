/**
 * City names per locale.
 *
 * City labels are *data* — the stored name is English and every surface used to
 * render a Chinese label for all languages. A place name is not really
 * "untranslatable content": readers expect Bangkok / バンコク / 방콕, so the label
 * is localised here rather than left as a Chinese string in an English UI.
 *
 * Keyed by the canonical English name stored in the database.
 */
import type { Locale } from "./locales";

export const CITY_NAMES: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    Bangkok: "曼谷",
    Barcelona: "巴塞罗那",
    Kyoto: "京都",
    London: "伦敦",
    "New York": "纽约",
    Paris: "巴黎",
    Seoul: "首尔",
    Singapore: "新加坡",
    Sydney: "悉尼",
    Tokyo: "东京",
  },
  "zh-TW": {
    Bangkok: "曼谷",
    Barcelona: "巴塞隆納",
    Kyoto: "京都",
    London: "倫敦",
    "New York": "紐約",
    Paris: "巴黎",
    Seoul: "首爾",
    Singapore: "新加坡",
    Sydney: "雪梨",
    Tokyo: "東京",
  },
  en: {
    Bangkok: "Bangkok",
    Barcelona: "Barcelona",
    Kyoto: "Kyoto",
    London: "London",
    "New York": "New York",
    Paris: "Paris",
    Seoul: "Seoul",
    Singapore: "Singapore",
    Sydney: "Sydney",
    Tokyo: "Tokyo",
  },
  ja: {
    Bangkok: "バンコク",
    Barcelona: "バルセロナ",
    Kyoto: "京都",
    London: "ロンドン",
    "New York": "ニューヨーク",
    Paris: "パリ",
    Seoul: "ソウル",
    Singapore: "シンガポール",
    Sydney: "シドニー",
    Tokyo: "東京",
  },
  ko: {
    Bangkok: "방콕",
    Barcelona: "바르셀로나",
    Kyoto: "교토",
    London: "런던",
    "New York": "뉴욕",
    Paris: "파리",
    Seoul: "서울",
    Singapore: "싱가포르",
    Sydney: "시드니",
    Tokyo: "도쿄",
  },
  es: {
    Bangkok: "Bangkok",
    Barcelona: "Barcelona",
    Kyoto: "Kioto",
    London: "Londres",
    "New York": "Nueva York",
    Paris: "París",
    Seoul: "Seúl",
    Singapore: "Singapur",
    Sydney: "Sídney",
    Tokyo: "Tokio",
  },
};

/** Localised city name for the canonical English name; falls back to the input. */
export function cityName(locale: Locale, englishName: string): string {
  return CITY_NAMES[locale]?.[englishName] ?? englishName;
}

/**
 * Country names, same reasoning as the cities above.
 *
 * This exists because localising the city alone produced a half-translated
 * address — "Camden, London · 英国" — which reads worse than leaving the whole
 * line in one language.
 */
export const COUNTRY_NAMES: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    Australia: "澳大利亚",
    France: "法国",
    Japan: "日本",
    Singapore: "新加坡",
    "South Korea": "韩国",
    Spain: "西班牙",
    Thailand: "泰国",
    "United Kingdom": "英国",
    "United States": "美国",
  },
  "zh-TW": {
    Australia: "澳洲",
    France: "法國",
    Japan: "日本",
    Singapore: "新加坡",
    "South Korea": "韓國",
    Spain: "西班牙",
    Thailand: "泰國",
    "United Kingdom": "英國",
    "United States": "美國",
  },
  en: {
    Australia: "Australia",
    France: "France",
    Japan: "Japan",
    Singapore: "Singapore",
    "South Korea": "South Korea",
    Spain: "Spain",
    Thailand: "Thailand",
    "United Kingdom": "United Kingdom",
    "United States": "United States",
  },
  ja: {
    Australia: "オーストラリア",
    France: "フランス",
    Japan: "日本",
    Singapore: "シンガポール",
    "South Korea": "韓国",
    Spain: "スペイン",
    Thailand: "タイ",
    "United Kingdom": "イギリス",
    "United States": "アメリカ合衆国",
  },
  ko: {
    Australia: "호주",
    France: "프랑스",
    Japan: "일본",
    Singapore: "싱가포르",
    "South Korea": "한국",
    Spain: "스페인",
    Thailand: "태국",
    "United Kingdom": "영국",
    "United States": "미국",
  },
  es: {
    Australia: "Australia",
    France: "Francia",
    Japan: "Japón",
    Singapore: "Singapur",
    "South Korea": "Corea del Sur",
    Spain: "España",
    Thailand: "Tailandia",
    "United Kingdom": "Reino Unido",
    "United States": "Estados Unidos",
  },
};

/** Localised country name for the canonical English name; falls back to the input. */
export function countryName(locale: Locale, englishName: string): string {
  return COUNTRY_NAMES[locale]?.[englishName] ?? englishName;
}
