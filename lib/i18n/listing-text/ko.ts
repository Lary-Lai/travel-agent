/**
 * Korean building blocks for listing titles and addresses.
 *
 * Listing titles are composed at render time from a neighbourhood, an optional
 * walk time, an adjective and a guest count. Those pieces are *data*, not UI
 * copy, so they are localised here rather than left as Chinese strings in a
 * Korean interface.
 *
 * Every key is the canonical Chinese string used by the database/seed
 * (`lib/cities.ts` neighbourhoods, `prisma/seed.ts` ADJECTIVES). The caller
 * appends the city name itself, which is why no template contains `{city}`.
 */

export const listingText = {
  /** Chinese neighbourhood name -> Korean. All 120, keyed by the Chinese string. */
  neighborhoods: {
    // ---- Tokyo ----
    涩谷: "시부야",
    新宿: "신주쿠",
    浅草: "아사쿠사",
    银座: "긴자",
    目黑: "메구로",
    台场: "오다이바",
    池袋: "이케부쿠로",
    中目黑: "나카메구로",
    上野: "우에노",
    六本木: "롯폰기",
    秋叶原: "아키하바라",
    代官山: "다이칸야마",
    // ---- Paris ----
    玛黑区: "마레 지구",
    蒙马特: "몽마르트르",
    拉丁区: "카르티에 라탱",
    塞纳河畔: "센강변",
    埃菲尔铁塔区: "에펠탑 지구",
    圣日耳曼: "생제르맹",
    巴士底: "바스티유",
    蒙帕纳斯: "몽파르나스",
    香榭丽舍: "샹젤리제",
    贝尔维尔: "벨빌",
    歌剧院区: "오페라 지구",
    卢森堡公园: "뤽상부르 공원",
    // ---- London ----
    肖尔迪奇: "쇼디치",
    卡姆登: "캠든",
    威斯敏斯特: "웨스트민스터",
    南岸: "사우스뱅크",
    诺丁山: "노팅힐",
    国王十字: "킹스크로스",
    格林威治: "그리니치",
    苏豪区: "소호",
    金丝雀码头: "카나리 워프",
    布里克斯顿: "브릭스턴",
    富勒姆: "풀럼",
    伊斯灵顿: "이즐링턴",
    // ---- New York ----
    曼哈顿中城: "미드타운",
    苏荷区: "소호",
    布鲁克林: "브루클린",
    威廉斯堡: "윌리엄스버그",
    上西区: "어퍼 웨스트사이드",
    切尔西: "첼시",
    东村: "이스트빌리지",
    翠贝卡: "트라이베카",
    哈莱姆: "할렘",
    长岛市: "롱아일랜드시티",
    格林威治村: "그리니치빌리지",
    下东区: "로어이스트사이드",
    // ---- Singapore ----
    乌节路: "오차드로드",
    滨海湾: "마리나베이",
    牛车水: "차이나타운",
    小印度: "리틀인디아",
    圣淘沙: "센토사",
    加东: "카통",
    荷兰村: "홀랜드빌리지",
    克拉码头: "클락키",
    东海岸: "이스트코스트",
    武吉士: "부기스",
    诺维娜: "노비나",
    裕廊: "주롱",
    // ---- Seoul ----
    江南: "강남",
    弘大: "홍대",
    明洞: "명동",
    梨泰院: "이태원",
    北村: "북촌",
    圣水洞: "성수동",
    梨大: "이대",
    钟路: "종로",
    蚕室: "잠실",
    汉南洞: "한남동",
    三清洞: "삼청동",
    麻浦: "마포",
    // ---- Kyoto ----
    祇园: "기온",
    河原町: "가와라마치",
    岚山: "아라시야마",
    清水寺周边: "기요미즈데라 주변",
    京都站前: "교토역 앞",
    先斗町: "폰토초",
    北山: "기타야마",
    伏见: "후시미",
    东山: "히가시야마",
    金阁寺周边: "긴카쿠지 주변",
    出町柳: "데마치야나기",
    乌丸: "가라스마",
    // ---- Bangkok ----
    素坤逸: "수쿰빗",
    暹罗: "사얌",
    是隆: "실롬",
    考山路: "카오산 로드",
    通罗: "통로",
    湄南河畔: "차오프라야 강변",
    阿索克: "아속",
    恰图恰: "짜뚜짝",
    沙吞: "사톤",
    水门: "프라투남",
    邦拉: "방락",
    拉差达: "라차다",
    // ---- Barcelona ----
    哥特区: "고딕 지구",
    格拉西亚: "그라시아",
    扩展区: "에이샴플레",
    巴塞罗内塔: "보르보네타",
    圣家堂周边: "사그라다 파밀리아 주변",
    兰布拉: "람블라스",
    波布雷诺: "포블레누",
    桑茨: "산츠",
    恩典区: "그라시아 지구",
    蒙特惠奇: "몬주익",
    提比达波: "티비다보",
    拉瓦尔: "라발",
    // ---- Sydney ----
    邦迪: "본다이",
    环形码头: "서큘러 키",
    达令港: "달링 하버",
    萨里山: "서리 힐스",
    新镇: "뉴타운",
    曼利: "맨리",
    岩石区: "더 록스",
    帕丁顿: "패딩턴",
    莫斯曼: "모스먼",
    库吉: "쿠지",
    车士活: "채츠우드",
    红坊: "레드펀",
  },

  /** Chinese adjective -> Korean. All 10. */
  adjectives: {
    温馨: "아늑한",
    现代: "모던한",
    明亮: "밝은",
    静谧: "조용한",
    复古: "레트로",
    简约: "심플한",
    精致: "세련된",
    舒适: "편안한",
    通透: "탁 트인",
    雅致: "우아한",
  },

  /**
   * Title templates per property type, mirroring the shapes in prisma/seed.ts.
   * Placeholders: {neighborhood} {walk} {adjective} {guests}
   * Do NOT include {city} — the caller appends the city itself.
   */
  templates: {
    APARTMENT: [
      "{neighborhood}역 도보 {walk}분 · {adjective} 아파트",
      "{neighborhood} · {adjective} 원룸",
      "{neighborhood} 중심가 · {adjective} 투룸",
      "{neighborhood} 신축 아파트 · {guests}인까지",
    ],
    HOUSE: [
      "{neighborhood} 단독주택 · {guests}인까지",
      "{neighborhood} {adjective} 단독주택 · 정원 있음",
      "{neighborhood} 가족용 주택 · {guests}인까지",
      "{neighborhood} {adjective} 복층 주택 · 독립 출입구",
    ],
    HOTEL: [
      "{neighborhood} {adjective} 부티크 호텔 · 조식 포함",
      "{neighborhood} 디자인 호텔 · 역 인접",
      "{neighborhood} {adjective} 호텔 스위트",
      "{neighborhood} 비즈니스 호텔 · 24시간 프런트",
    ],
    VILLA: [
      "{neighborhood} 수영장 딸린 빌라 · 전용 정원",
      "{neighborhood} {adjective} 빌라 · {guests}인까지",
      "{neighborhood} 전망 좋은 빌라 · 테라스 바비큐",
      "{neighborhood} {adjective} 단독 빌라 · 버틀러 서비스",
    ],
    LOFT: [
      "{neighborhood} 인더스트리얼 LOFT · 높은 층고",
      "{neighborhood} 복층 LOFT · 채광 좋음",
      "{neighborhood} {adjective} LOFT · 오픈 주방",
      "{neighborhood} 예술가 LOFT · 창작 단지 인접",
    ],
    GUESTHOUSE: [
      "{neighborhood} {adjective} 게스트하우스 · 현지 골목",
      "{neighborhood} 가정식 민박 · 전용 욕실",
      "{neighborhood} {adjective} 민박 · 수제 조식",
      "{neighborhood} 고택 민박 · 안뜰 딸림",
    ],
  },
} as const;
