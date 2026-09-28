/**
 * Traditional Chinese — Taiwan (zh-TW) building blocks for listing titles and
 * addresses.
 *
 * Mirrors the Chinese source data:
 *  - `neighborhoods` covers every entry in `CITIES[].neighborhoods` (lib/cities.ts).
 *  - `adjectives` mirrors `ADJECTIVES` in prisma/seed.ts.
 *  - `templates` mirrors the `candidates` map in `buildTitle` (prisma/seed.ts).
 *
 * Keys are the *Simplified* strings exactly as they appear in lib/cities.ts and
 * prisma/seed.ts, because the seed looks them up by that key. Only the values
 * are Traditional Chinese with Taiwan wording (分鐘/獨棟/衛浴/套房/電梯…).
 *
 * Placeholders: {neighborhood} {walk} {adjective} {guests}
 * `{city}` is intentionally absent — the caller appends the city itself.
 */

export const listingText = {
  /** Simplified neighbourhood name -> Traditional (Taiwan). All 120, keyed by the SIMPLIFIED string as it appears in lib/cities.ts. */
  neighborhoods: {
    // ---- Tokyo ----
    涩谷: "澀谷",
    新宿: "新宿",
    浅草: "淺草",
    银座: "銀座",
    目黑: "目黑",
    台场: "台場",
    池袋: "池袋",
    中目黑: "中目黑",
    上野: "上野",
    六本木: "六本木",
    秋叶原: "秋葉原",
    代官山: "代官山",

    // ---- Paris ----
    玛黑区: "瑪黑區",
    蒙马特: "蒙馬特",
    拉丁区: "拉丁區",
    塞纳河畔: "塞納河畔",
    埃菲尔铁塔区: "艾菲爾鐵塔區",
    圣日耳曼: "聖日耳曼",
    巴士底: "巴士底",
    蒙帕纳斯: "蒙帕納斯",
    香榭丽舍: "香榭麗舍",
    贝尔维尔: "貝爾維爾",
    歌剧院区: "歌劇院區",
    卢森堡公园: "盧森堡公園",

    // ---- London ----
    肖尔迪奇: "肖爾迪奇",
    卡姆登: "卡姆登",
    威斯敏斯特: "西敏",
    南岸: "南岸",
    诺丁山: "諾丁山",
    国王十字: "國王十字",
    格林威治: "格林威治",
    苏豪区: "蘇活區",
    金丝雀码头: "金絲雀碼頭",
    布里克斯顿: "布里克斯頓",
    富勒姆: "富勒姆",
    伊斯灵顿: "伊斯靈頓",

    // ---- New York ----
    曼哈顿中城: "曼哈頓中城",
    苏荷区: "蘇活區",
    布鲁克林: "布魯克林",
    威廉斯堡: "威廉斯堡",
    上西区: "上西區",
    切尔西: "切爾西",
    东村: "東村",
    翠贝卡: "翠貝卡",
    哈莱姆: "哈林",
    长岛市: "長島市",
    格林威治村: "格林威治村",
    下东区: "下東區",

    // ---- Singapore ----
    乌节路: "烏節路",
    滨海湾: "濱海灣",
    牛车水: "牛車水",
    小印度: "小印度",
    圣淘沙: "聖淘沙",
    加东: "加東",
    荷兰村: "荷蘭村",
    克拉码头: "克拉碼頭",
    东海岸: "東海岸",
    武吉士: "武吉士",
    诺维娜: "諾維娜",
    裕廊: "裕廊",

    // ---- Seoul ----
    江南: "江南",
    弘大: "弘大",
    明洞: "明洞",
    梨泰院: "梨泰院",
    北村: "北村",
    圣水洞: "聖水洞",
    梨大: "梨大",
    钟路: "鐘路",
    蚕室: "蠶室",
    汉南洞: "漢南洞",
    三清洞: "三清洞",
    麻浦: "麻浦",

    // ---- Kyoto ----
    祇园: "祇園",
    河原町: "河原町",
    岚山: "嵐山",
    清水寺周边: "清水寺周邊",
    京都站前: "京都站前",
    先斗町: "先斗町",
    北山: "北山",
    伏见: "伏見",
    东山: "東山",
    金阁寺周边: "金閣寺周邊",
    出町柳: "出町柳",
    乌丸: "烏丸",

    // ---- Bangkok ----
    素坤逸: "素坤逸",
    暹罗: "暹羅",
    是隆: "是隆",
    考山路: "考山路",
    通罗: "通羅",
    湄南河畔: "湄南河畔",
    阿索克: "阿索克",
    恰图恰: "恰圖恰",
    沙吞: "沙吞",
    水门: "水門",
    邦拉: "邦拉",
    拉差达: "拉差達",

    // ---- Barcelona ----
    哥特区: "哥德區",
    格拉西亚: "格拉西亞",
    扩展区: "擴展區",
    巴塞罗内塔: "巴塞隆內塔",
    圣家堂周边: "聖家堂周邊",
    兰布拉: "蘭布拉",
    波布雷诺: "波布雷諾",
    桑茨: "桑茨",
    恩典区: "恩典區",
    蒙特惠奇: "蒙特惠奇",
    提比达波: "提比達波",
    拉瓦尔: "拉瓦爾",

    // ---- Sydney ----
    邦迪: "邦迪",
    环形码头: "環形碼頭",
    达令港: "達令港",
    萨里山: "薩里山",
    新镇: "新鎮",
    曼利: "曼利",
    岩石区: "岩石區",
    帕丁顿: "帕丁頓",
    莫斯曼: "莫斯曼",
    库吉: "庫吉",
    车士活: "車士活",
    红坊: "紅坊",
  } as Record<string, string>,

  /** Simplified adjective -> Traditional. All 10. */
  adjectives: {
    温馨: "溫馨",
    现代: "現代",
    明亮: "明亮",
    静谧: "靜謐",
    复古: "復古",
    简约: "簡約",
    精致: "精緻",
    舒适: "舒適",
    通透: "通透",
    雅致: "雅緻",
  } as Record<string, string>,

  /**
   * Title templates per property type, mirroring the shapes in prisma/seed.ts.
   * Placeholders: {neighborhood} {walk} {adjective} {guests}
   * Do NOT include {city} — the caller appends the city itself.
   */
  templates: {
    APARTMENT: [
      "{neighborhood}站步行 {walk} 分鐘 · {adjective}公寓",
      "{neighborhood} · {adjective}一房一廳",
      "{neighborhood}核心地段 · {adjective}兩房公寓",
      "{neighborhood}設計師公寓 · 近捷運",
    ],
    HOUSE: [
      "{neighborhood}獨棟小院 · 可住 {guests} 人",
      "{neighborhood} · {adjective}獨棟 · 附花園",
      "{neighborhood}家庭獨棟 · {guests} 人入住",
      "{neighborhood} · {adjective}兩層樓房 · 獨立出入口",
    ],
    HOTEL: [
      "{neighborhood} · {adjective}精品旅店 · 含早餐",
      "{neighborhood}設計旅店 · 捷運站旁",
      "{neighborhood} · {adjective}旅店套房 · 可住 {guests} 人",
      "{neighborhood}商務旅店 · 24 小時櫃檯",
    ],
    VILLA: [
      "{neighborhood}泳池別墅 · 私人庭院",
      "{neighborhood} · {adjective}別墅 · 可住 {guests} 人",
      "{neighborhood}山景別墅 · 露台烤肉區",
      "{neighborhood} · {adjective}獨棟別墅 · 管家服務",
    ],
    LOFT: [
      "{neighborhood}工業風樓中樓 · 挑高空間",
      "{neighborhood}樓中樓 · 採光極佳",
      "{neighborhood} · {adjective}樓中樓 · 開放式廚房",
      "{neighborhood}藝術家閣樓 · 近文創園區",
    ],
    GUESTHOUSE: [
      "{neighborhood} · {adjective}民宿 · 在地生活圈",
      "{neighborhood}家庭式民宿 · 獨立衛浴",
      "{neighborhood} · {adjective}民宿 · 手作早餐",
      "{neighborhood}老宅民宿 · 庭院天井",
    ],
  },
} as const;
