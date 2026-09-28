/**
 * English (en) building blocks for listing titles and addresses.
 *
 * Mirrors the Chinese source data:
 *  - `neighborhoods` covers every entry in `CITIES[].neighborhoods` (lib/cities.ts).
 *  - `adjectives` mirrors `ADJECTIVES` in prisma/seed.ts.
 *  - `templates` mirrors the `candidates` map in `buildTitle` (prisma/seed.ts).
 *
 * Placeholders: {neighborhood} {walk} {adjective} {guests}
 * `{city}` is intentionally absent — the caller appends the city itself.
 * All values are plain ASCII English; `·` (U+00B7) and `|` are the separators.
 */

export const listingText = {
  /** Chinese neighbourhood name -> English. All 120, keyed by the Chinese string. */
  neighborhoods: {
    // ---- Tokyo ----
    涩谷: "Shibuya",
    新宿: "Shinjuku",
    浅草: "Asakusa",
    银座: "Ginza",
    目黑: "Meguro",
    台场: "Odaiba",
    池袋: "Ikebukuro",
    中目黑: "Nakameguro",
    上野: "Ueno",
    六本木: "Roppongi",
    秋叶原: "Akihabara",
    代官山: "Daikanyama",

    // ---- Paris ----
    玛黑区: "Le Marais",
    蒙马特: "Montmartre",
    拉丁区: "Latin Quarter",
    塞纳河畔: "Seine Riverside",
    埃菲尔铁塔区: "Eiffel Tower District",
    圣日耳曼: "Saint-Germain",
    巴士底: "Bastille",
    蒙帕纳斯: "Montparnasse",
    香榭丽舍: "Champs-Elysees",
    贝尔维尔: "Belleville",
    歌剧院区: "Opera District",
    卢森堡公园: "Luxembourg Gardens",

    // ---- London ----
    肖尔迪奇: "Shoreditch",
    卡姆登: "Camden",
    威斯敏斯特: "Westminster",
    南岸: "South Bank",
    诺丁山: "Notting Hill",
    国王十字: "King's Cross",
    格林威治: "Greenwich",
    苏豪区: "SoHo",
    金丝雀码头: "Canary Wharf",
    布里克斯顿: "Brixton",
    富勒姆: "Fulham",
    伊斯灵顿: "Islington",

    // ---- New York ----
    曼哈顿中城: "Midtown Manhattan",
    苏荷区: "SoHo",
    布鲁克林: "Brooklyn",
    威廉斯堡: "Williamsburg",
    上西区: "Upper West Side",
    切尔西: "Chelsea",
    东村: "East Village",
    翠贝卡: "Tribeca",
    哈莱姆: "Harlem",
    长岛市: "Long Island City",
    格林威治村: "Greenwich Village",
    下东区: "Lower East Side",

    // ---- Singapore ----
    乌节路: "Orchard Road",
    滨海湾: "Marina Bay",
    牛车水: "Chinatown",
    小印度: "Little India",
    圣淘沙: "Sentosa",
    加东: "Katong",
    荷兰村: "Holland Village",
    克拉码头: "Clarke Quay",
    东海岸: "East Coast",
    武吉士: "Bugis",
    诺维娜: "Novena",
    裕廊: "Jurong",

    // ---- Seoul ----
    江南: "Gangnam",
    弘大: "Hongdae",
    明洞: "Myeongdong",
    梨泰院: "Itaewon",
    北村: "Bukchon",
    圣水洞: "Seongsu-dong",
    梨大: "Ewha",
    钟路: "Jongno",
    蚕室: "Jamsil",
    汉南洞: "Hannam-dong",
    三清洞: "Samcheong-dong",
    麻浦: "Mapo",

    // ---- Kyoto ----
    祇园: "Gion",
    河原町: "Kawaramachi",
    岚山: "Arashiyama",
    清水寺周边: "Kiyomizu-dera",
    京都站前: "Kyoto Station",
    先斗町: "Pontocho",
    北山: "Kitayama",
    伏见: "Fushimi",
    东山: "Higashiyama",
    金阁寺周边: "Kinkaku-ji",
    出町柳: "Demachiyanagi",
    乌丸: "Karasuma",

    // ---- Bangkok ----
    素坤逸: "Sukhumvit",
    暹罗: "Siam",
    是隆: "Silom",
    考山路: "Khao San Road",
    通罗: "Thonglor",
    湄南河畔: "Chao Phraya Riverside",
    阿索克: "Asok",
    恰图恰: "Chatuchak",
    沙吞: "Sathorn",
    水门: "Pratunam",
    邦拉: "Bang Rak",
    拉差达: "Ratchada",

    // ---- Barcelona ----
    哥特区: "Gothic Quarter",
    格拉西亚: "Gracia",
    扩展区: "Eixample",
    巴塞罗内塔: "Barceloneta",
    圣家堂周边: "Sagrada Familia",
    兰布拉: "Las Ramblas",
    波布雷诺: "Poblenou",
    桑茨: "Sants",
    恩典区: "Gracia",
    蒙特惠奇: "Montjuic",
    提比达波: "Tibidabo",
    拉瓦尔: "El Raval",

    // ---- Sydney ----
    邦迪: "Bondi",
    环形码头: "Circular Quay",
    达令港: "Darling Harbour",
    萨里山: "Surry Hills",
    新镇: "Newtown",
    曼利: "Manly",
    岩石区: "The Rocks",
    帕丁顿: "Paddington",
    莫斯曼: "Mosman",
    库吉: "Coogee",
    车士活: "Chatswood",
    红坊: "Redfern",
  } satisfies Record<string, string>,

  /** Chinese adjective -> English. All 10. */
  adjectives: {
    温馨: "Cosy",
    现代: "Modern",
    明亮: "Bright",
    静谧: "Quiet",
    复古: "Vintage",
    简约: "Minimalist",
    精致: "Refined",
    舒适: "Comfortable",
    通透: "Airy",
    雅致: "Elegant",
  } satisfies Record<string, string>,

  /**
   * Title templates per property type, mirroring the shapes in prisma/seed.ts.
   * Placeholders: {neighborhood} {walk} {adjective} {guests}
   * Do NOT include {city} — the caller appends the city itself.
   */
  templates: {
    APARTMENT: [
      "{walk} min walk to {neighborhood} Station",
      "{neighborhood} · {adjective} one-bedroom flat",
      "{neighborhood} · two-bed near the metro",
      "{neighborhood} designer flat · city views",
      "{neighborhood} top-floor apartment · sleeps {guests}",
      "{neighborhood} · {adjective} three-bed for families",
    ],
    HOUSE: [
      "{neighborhood} · {adjective} cottage · sleeps {guests}",
      "{neighborhood} detached house · private garden",
      "{neighborhood} family house · sleeps {guests}",
      "{neighborhood} · {adjective} house · own entrance",
    ],
    HOTEL: [
      "{neighborhood} · {adjective} hotel with breakfast",
      "{neighborhood} design hotel · next to the metro",
      "{neighborhood} · {adjective} hotel suite · sleeps {guests}",
      "{neighborhood} business hotel · 24-hour front desk",
    ],
    VILLA: [
      "{neighborhood} villa with pool · private courtyard",
      "{neighborhood} · {adjective} villa · sleeps {guests}",
      "{neighborhood} hillside villa · terrace and BBQ",
      "{neighborhood} · {adjective} villa · butler service",
    ],
    LOFT: [
      "{neighborhood} industrial loft · double-height space",
      "{neighborhood} duplex loft · flooded with light",
      "{neighborhood} · {adjective} loft · open-plan kitchen",
      "{neighborhood} artist loft · near creative quarter",
    ],
    GUESTHOUSE: [
      "{neighborhood} · {adjective} guesthouse · local life",
      "{neighborhood} family guesthouse · private bathroom",
      "{neighborhood} · {adjective} guesthouse · breakfast",
      "{neighborhood} heritage guesthouse · courtyard patio",
    ],
  },
} satisfies {
  neighborhoods: Record<string, string>;
  adjectives: Record<string, string>;
  templates: Record<string, string[]>;
};
