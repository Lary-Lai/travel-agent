/**
 * Canonical city metadata.
 *
 * The database stores the ENGLISH city name (stable, index-friendly, and what
 * the LLM naturally passes to tools). Chinese labels are applied at render time,
 * and `aliases` let free-text search match either language.
 */
export type CityMeta = {
  /** English name as stored in `Listing.city`. */
  name: string;
  /** Chinese display label. */
  nameZh: string;
  /** English country as stored in `Listing.country`. */
  country: string;
  countryZh: string;
  latitude: number;
  longitude: number;
  /** Neighborhoods used to build realistic listing addresses. */
  neighborhoods: string[];
  /** Baseline nightly price in CNY; per-listing jitter is applied by the seed. */
  basePrice: number;
  /** Extra strings that should resolve to this city. */
  aliases: string[];
};

export const CITIES: CityMeta[] = [
  {
    name: "Tokyo",
    nameZh: "东京",
    country: "Japan",
    countryZh: "日本",
    latitude: 35.6762,
    longitude: 139.6503,
    basePrice: 700,
    neighborhoods: [
      "涩谷",
      "新宿",
      "浅草",
      "银座",
      "目黑",
      "台场",
      "池袋",
      "中目黑",
      "上野",
      "六本木",
      "秋叶原",
      "代官山",
    ],
    aliases: ["tokyo", "东京", "东京都", "とうきょう", "日本", "japan"],
  },
  {
    name: "Paris",
    nameZh: "巴黎",
    country: "France",
    countryZh: "法国",
    latitude: 48.8566,
    longitude: 2.3522,
    basePrice: 850,
    neighborhoods: [
      "玛黑区",
      "蒙马特",
      "拉丁区",
      "塞纳河畔",
      "埃菲尔铁塔区",
      "圣日耳曼",
      "巴士底",
      "蒙帕纳斯",
      "香榭丽舍",
      "贝尔维尔",
      "歌剧院区",
      "卢森堡公园",
    ],
    aliases: ["paris", "巴黎", "法国", "france"],
  },
  {
    name: "London",
    nameZh: "伦敦",
    country: "United Kingdom",
    countryZh: "英国",
    latitude: 51.5074,
    longitude: -0.1278,
    basePrice: 800,
    neighborhoods: [
      "肖尔迪奇",
      "卡姆登",
      "威斯敏斯特",
      "南岸",
      "诺丁山",
      "国王十字",
      "格林威治",
      "苏豪区",
      "金丝雀码头",
      "布里克斯顿",
      "富勒姆",
      "伊斯灵顿",
    ],
    aliases: ["london", "伦敦", "英国", "uk", "united kingdom", "england"],
  },
  {
    name: "New York",
    nameZh: "纽约",
    country: "United States",
    countryZh: "美国",
    latitude: 40.7128,
    longitude: -74.006,
    basePrice: 1000,
    neighborhoods: [
      "曼哈顿中城",
      "苏荷区",
      "布鲁克林",
      "威廉斯堡",
      "上西区",
      "切尔西",
      "东村",
      "翠贝卡",
      "哈莱姆",
      "长岛市",
      "格林威治村",
      "下东区",
    ],
    aliases: ["new york", "newyork", "nyc", "纽约", "美国", "usa", "united states"],
  },
  {
    name: "Singapore",
    nameZh: "新加坡",
    country: "Singapore",
    countryZh: "新加坡",
    latitude: 1.3521,
    longitude: 103.8198,
    basePrice: 750,
    neighborhoods: [
      "乌节路",
      "滨海湾",
      "牛车水",
      "小印度",
      "圣淘沙",
      "加东",
      "荷兰村",
      "克拉码头",
      "东海岸",
      "武吉士",
      "诺维娜",
      "裕廊",
    ],
    aliases: ["singapore", "新加坡", "狮城"],
  },
  {
    name: "Seoul",
    nameZh: "首尔",
    country: "South Korea",
    countryZh: "韩国",
    latitude: 37.5665,
    longitude: 126.978,
    basePrice: 520,
    neighborhoods: [
      "江南",
      "弘大",
      "明洞",
      "梨泰院",
      "北村",
      "圣水洞",
      "梨大",
      "钟路",
      "蚕室",
      "汉南洞",
      "三清洞",
      "麻浦",
    ],
    aliases: ["seoul", "首尔", "汉城", "韩国", "korea", "south korea"],
  },
  {
    name: "Kyoto",
    nameZh: "京都",
    country: "Japan",
    countryZh: "日本",
    latitude: 35.0116,
    longitude: 135.7681,
    basePrice: 620,
    neighborhoods: [
      "祇园",
      "河原町",
      "岚山",
      "清水寺周边",
      "京都站前",
      "先斗町",
      "北山",
      "伏见",
      "东山",
      "金阁寺周边",
      "出町柳",
      "乌丸",
    ],
    aliases: ["kyoto", "京都", "京都市", "きょうと", "日本", "japan"],
  },
  {
    name: "Bangkok",
    nameZh: "曼谷",
    country: "Thailand",
    countryZh: "泰国",
    latitude: 13.7563,
    longitude: 100.5018,
    basePrice: 420,
    neighborhoods: [
      "素坤逸",
      "暹罗",
      "是隆",
      "考山路",
      "通罗",
      "湄南河畔",
      "阿索克",
      "恰图恰",
      "沙吞",
      "水门",
      "邦拉",
      "拉差达",
    ],
    aliases: ["bangkok", "曼谷", "泰国", "thailand", "bkk"],
  },
  {
    name: "Barcelona",
    nameZh: "巴塞罗那",
    country: "Spain",
    countryZh: "西班牙",
    latitude: 41.3874,
    longitude: 2.1686,
    basePrice: 760,
    neighborhoods: [
      "哥特区",
      "格拉西亚",
      "扩展区",
      "巴塞罗内塔",
      "圣家堂周边",
      "兰布拉",
      "波布雷诺",
      "桑茨",
      "恩典区",
      "蒙特惠奇",
      "提比达波",
      "拉瓦尔",
    ],
    aliases: ["barcelona", "巴塞罗那", "巴塞", "西班牙", "spain", "bcn"],
  },
  {
    name: "Sydney",
    nameZh: "悉尼",
    country: "Australia",
    countryZh: "澳大利亚",
    latitude: -33.8688,
    longitude: 151.2093,
    basePrice: 880,
    neighborhoods: [
      "邦迪",
      "环形码头",
      "达令港",
      "萨里山",
      "新镇",
      "曼利",
      "岩石区",
      "帕丁顿",
      "莫斯曼",
      "库吉",
      "车士活",
      "红坊",
    ],
    aliases: ["sydney", "悉尼", "澳大利亚", "澳洲", "australia", "syd"],
  },
];

const CITY_BY_NAME = new Map(CITIES.map((c) => [c.name.toLowerCase(), c]));

/** Resolve free text (English or Chinese, any case) to a canonical city. */
export function findCity(input: string | null | undefined): CityMeta | undefined {
  if (!input) return undefined;
  const needle = input.trim().toLowerCase();
  if (!needle) return undefined;

  // Exact canonical match first.
  const exact = CITY_BY_NAME.get(needle);
  if (exact) return exact;

  // Then explicit aliases.
  const byAlias = CITIES.find((c) => c.aliases.includes(needle));
  if (byAlias) return byAlias;

  // Then substring, so "东京都涩谷区" or "Greater London" still resolve.
  return CITIES.find(
    (c) => needle.includes(c.name.toLowerCase()) || c.aliases.some((a) => needle.includes(a)),
  );
}

/** English city name -> Chinese label, falling back to the input. */
export function cityLabel(name: string | null | undefined): string {
  if (!name) return "";
  return CITY_BY_NAME.get(name.toLowerCase())?.nameZh ?? name;
}

/** Chinese/English country name -> Chinese label. */
export function countryLabel(country: string | null | undefined): string {
  if (!country) return "";
  return CITIES.find((c) => c.country.toLowerCase() === country.toLowerCase())?.countryZh ?? country;
}

/** Every neighborhood across all cities, longest-first for greedy matching. */
export const ALL_NEIGHBORHOODS = CITIES.flatMap((c) =>
  c.neighborhoods.map((n) => ({ neighborhood: n, city: c.name })),
).sort((a, b) => b.neighborhood.length - a.neighborhood.length);
