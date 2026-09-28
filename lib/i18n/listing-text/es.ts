/**
 * Spanish (Spain, neutral) building blocks for listing titles and addresses.
 *
 * Mirrors the source data in `lib/cities.ts` (120 neighbourhoods across 10
 * cities) and `prisma/seed.ts` (`ADJECTIVES` + `buildTitle` template shapes).
 * Keys stay Chinese so callers can look up by the stored value; only the values
 * are translated.
 */
export const listingText = {
  /** Chinese neighbourhood name -> Spanish. All 120, keyed by the Chinese string. */
  neighborhoods: {
    // ---- Tokyo ----
    "涩谷": "Shibuya",
    "新宿": "Shinjuku",
    "浅草": "Asakusa",
    "银座": "Ginza",
    "目黑": "Meguro",
    "台场": "Odaiba",
    "池袋": "Ikebukuro",
    "中目黑": "Naka-Meguro",
    "上野": "Ueno",
    "六本木": "Roppongi",
    "秋叶原": "Akihabara",
    "代官山": "Daikanyama",

    // ---- Paris ----
    "玛黑区": "Le Marais",
    "蒙马特": "Montmartre",
    "拉丁区": "Barrio Latino",
    "塞纳河畔": "Orillas del Sena",
    "埃菲尔铁塔区": "Zona de la Torre Eiffel",
    "圣日耳曼": "Saint-Germain",
    "巴士底": "Bastilla",
    "蒙帕纳斯": "Montparnasse",
    "香榭丽舍": "Campos Elíseos",
    "贝尔维尔": "Belleville",
    "歌剧院区": "Zona de la Ópera",
    "卢森堡公园": "Jardines de Luxemburgo",

    // ---- London ----
    "肖尔迪奇": "Shoreditch",
    "卡姆登": "Camden",
    "威斯敏斯特": "Westminster",
    "南岸": "South Bank",
    "诺丁山": "Notting Hill",
    "国王十字": "King's Cross",
    "格林威治": "Greenwich",
    "苏豪区": "Soho",
    "金丝雀码头": "Canary Wharf",
    "布里克斯顿": "Brixton",
    "富勒姆": "Fulham",
    "伊斯灵顿": "Islington",

    // ---- New York ----
    "曼哈顿中城": "Midtown",
    "苏荷区": "SoHo",
    "布鲁克林": "Brooklyn",
    "威廉斯堡": "Williamsburg",
    "上西区": "Upper West Side",
    "切尔西": "Chelsea",
    "东村": "East Village",
    "翠贝卡": "Tribeca",
    "哈莱姆": "Harlem",
    "长岛市": "Long Island City",
    "格林威治村": "Greenwich Village",
    "下东区": "Lower East Side",

    // ---- Singapore ----
    "乌节路": "Orchard Road",
    "滨海湾": "Marina Bay",
    "牛车水": "Chinatown",
    "小印度": "Little India",
    "圣淘沙": "Sentosa",
    "加东": "Katong",
    "荷兰村": "Holland Village",
    "克拉码头": "Clarke Quay",
    "东海岸": "East Coast",
    "武吉士": "Bugis",
    "诺维娜": "Novena",
    "裕廊": "Jurong",

    // ---- Seoul ----
    "江南": "Gangnam",
    "弘大": "Hongdae",
    "明洞": "Myeongdong",
    "梨泰院": "Itaewon",
    "北村": "Bukchon",
    "圣水洞": "Seongsu-dong",
    "梨大": "Ewha",
    "钟路": "Jongno",
    "蚕室": "Jamsil",
    "汉南洞": "Hannam-dong",
    "三清洞": "Samcheong-dong",
    "麻浦": "Mapo",

    // ---- Kyoto ----
    "祇园": "Gion",
    "河原町": "Kawaramachi",
    "岚山": "Arashiyama",
    "清水寺周边": "Kiyomizu-dera",
    "京都站前": "Estación de Kioto",
    "先斗町": "Pontocho",
    "北山": "Kitayama",
    "伏见": "Fushimi",
    "东山": "Higashiyama",
    "金阁寺周边": "Kinkaku-ji",
    "出町柳": "Demachiyanagi",
    "乌丸": "Karasuma",

    // ---- Bangkok ----
    "素坤逸": "Sukhumvit",
    "暹罗": "Siam",
    "是隆": "Silom",
    "考山路": "Khao San Road",
    "通罗": "Thonglor",
    "湄南河畔": "Orillas del Chao Phraya",
    "阿索克": "Asok",
    "恰图恰": "Chatuchak",
    "沙吞": "Sathorn",
    "水门": "Pratunam",
    "邦拉": "Bang Rak",
    "拉差达": "Ratchada",

    // ---- Barcelona ----
    "哥特区": "Barrio Gótico",
    "格拉西亚": "Gràcia",
    "扩展区": "Eixample",
    "巴塞罗内塔": "Barceloneta",
    "圣家堂周边": "Sagrada Familia",
    "兰布拉": "La Rambla",
    "波布雷诺": "Poblenou",
    "桑茨": "Sants",
    "恩典区": "Vila de Gràcia",
    "蒙特惠奇": "Montjuïc",
    "提比达波": "Tibidabo",
    "拉瓦尔": "El Raval",

    // ---- Sydney ----
    "邦迪": "Bondi",
    "环形码头": "Circular Quay",
    "达令港": "Darling Harbour",
    "萨里山": "Surry Hills",
    "新镇": "Newtown",
    "曼利": "Manly",
    "岩石区": "The Rocks",
    "帕丁顿": "Paddington",
    "莫斯曼": "Mosman",
    "库吉": "Coogee",
    "车士活": "Chatswood",
    "红坊": "Redfern",
  },

  /** Chinese adjective -> Spanish (masculine singular, to agree with "apartamento" etc.). All 10. */
  adjectives: {
    "温馨": "acogedor",
    "现代": "moderno",
    "明亮": "luminoso",
    "静谧": "tranquilo",
    "复古": "vintage",
    "简约": "sencillo",
    "精致": "elegante",
    "舒适": "cómodo",
    "通透": "diáfano",
    "雅致": "con encanto",
  },

  /**
   * Title templates per property type, mirroring the shapes in prisma/seed.ts.
   * Placeholders: {neighborhood} {walk} {adjective} {guests}
   * Do NOT include {city} — the caller appends the city itself.
   *
   * Agreement note: {adjective} is masculine singular, so it only ever attaches
   * to a masculine noun here (apartamento, estudio, chalet, hotel, loft,
   * alojamiento) or to "espacio"/"ambiente". Feminine nouns (casa, villa,
   * suite) are never paired with {adjective} directly.
   */
  templates: {
    APARTMENT: [
      "{neighborhood} · Apartamento {adjective}",
      "{neighborhood} · Apartamento {adjective} para {guests}",
      "A {walk} min andando de {neighborhood} · Apartamento",
      "{neighborhood} · Estudio {adjective} · Terraza",
    ],
    HOUSE: [
      "{neighborhood} · Chalet {adjective} y jardín",
      "{neighborhood} · Casa familiar · {guests} huéspedes",
      "A {walk} min andando de {neighborhood} · Chalet",
      "{neighborhood} · Casa con jardín · Entrada propia",
    ],
    HOTEL: [
      "{neighborhood} · Hotel {adjective} y desayuno",
      "{neighborhood} · Hotel boutique · Cerca del metro",
      "{neighborhood} · Hotel {adjective} · Cama doble",
      "{neighborhood} · Suite de hotel · Recepción 24 h",
    ],
    VILLA: [
      "{neighborhood} · Villa con piscina · {guests} huéspedes",
      "{neighborhood} · Villa de lujo · Salón {adjective}",
      "{neighborhood} · Villa con jardín · Barbacoa",
      "A {walk} min andando de {neighborhood} · Villa",
    ],
    LOFT: [
      "{neighborhood} · Loft {adjective} estilo industrial",
      "{neighborhood} · Loft {adjective} · Doble altura",
      "A {walk} min andando de {neighborhood} · Loft",
      "{neighborhood} · Loft de artista · Zona creativa",
    ],
    GUESTHOUSE: [
      "{neighborhood} · Hostal {adjective} · Baño privado",
      "{neighborhood} · Hostal {adjective} · Desayuno",
      "{neighborhood} · Casa de huéspedes · Barrio local",
      "A {walk} min andando de {neighborhood} · Hostal",
    ],
  },
} as const;
