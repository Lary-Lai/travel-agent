/**
 * Simplified Chinese — the reference dictionary.
 *
 * Every other locale is typed against this object, so a missing key is a
 * compile error rather than a string that silently renders as its own name.
 * `{name}` placeholders are interpolated by `translate()`.
 *
 * Scope note: this covers the interface chrome. Seeded *content* (listing
 * titles, descriptions, review bodies, amenity explanations) is authored data
 * and stays as written — see the README.
 */
export const zhCN = {
  common: {
    search: "搜索",
    cancel: "取消",
    confirm: "确定",
    save: "保存",
    clear: "清除",
    remove: "移除",
    delete: "删除",
    edit: "编辑",
    close: "关闭",
    reset: "重置",
    back: "返回",
    loading: "加载中…",
    viewAll: "查看全部",
    optional: "可选",
    required: "必填",
    login: "登录",
    register: "注册",
    logout: "退出登录",
    profile: "个人主页",
    settings: "设置",
    language: "语言",
    menu: "打开菜单",
    navigation: "导航菜单",
    account: "账户菜单",
    perNight: "/ 晚",
    nights: "{count} 晚",
    guests: "{count} 位",
    guestsAny: "不限",
    reviews: "{count} 条评价",
    night: "晚",
  },

  nav: {
    home: "首页",
    search: "搜索房源",
    wishlist: "心愿单",
    trips: "我的行程",
    aiAgent: "AI 助手",
    aiAgentTitle: "AI 民宿助手",
  },

  home: {
    badge: "AI Travel Agent 已上线",
    heroLine1: "让 AI 帮你找到",
    heroLine2: "旅途中的家",
    heroSubtitle: "{cities} 座城市 · {listings} 套真实房源。搜索、收藏、预订，或者直接用一句话描述需求，让 Agent 帮你搞定。",
    browseByType: "按房源类型浏览",
    browseByTypeHint: "公寓、独栋、酒店、别墅，总有一款适合你",
    destinations: "热门目的地",
    destinationsHint: "{cities} 座城市，点击直接查看当地全部房源",
    recommended: "为你推荐的房源",
    recommendedHint: "按评分与评价数挑选的高分房源",
    browseAll: "浏览全部房源",
    personalised: "根据你的搜索记录推荐",
    personalisedHint: "你已经搜索过 {count} 次，这些是你最常关注的城市",
    popularForYou: "为你推荐的目的地",
    popularHint: "登录并搜索几次后，这里会变成只属于你的推荐",
    personalisedBadge: "个性化",
    loadFailedTitle: "房源数据加载失败",
    loadFailedBody: "无法连接数据库。请确认 PostgreSQL 已启动并已生成演示数据。",
    emptyTitle: "还没有房源数据",
    emptyBody: "运行 npm run db:seed 生成演示房源后刷新本页。",
    destinationCard: "{count} 套房源 · 起 {price}",
  },

  searchBar: {
    destination: "目的地",
    destinationPlaceholder: "想去哪里？",
    destinationInput: "输入城市，例如 东京 / Tokyo",
    dates: "入住 / 退房",
    datesPlaceholder: "选择日期",
    selectCheckout: "选择退房日",
    guests: "入住人数",
    guestsPlaceholder: "添加人数",
    popular: "热门目的地",
    clearDates: "清除",
    datePrompt: "请选择入住与退房日期",
    noDatesHint: "未选择日期时展示全部可订房源",
  },

  filters: {
    title: "筛选条件",
    price: "每晚价格",
    priceMin: "最低价",
    priceMax: "最高价",
    guests: "入住人数",
    propertyType: "房源类型",
    amenities: "设施与服务",
    activeCount: "{count} 个筛选条件",
    decrease: "减少人数",
    increase: "增加人数",
    any: "不限",
    more: "更多",
    showResults: "查看结果",
  },

  sort: {
    recommended: "推荐排序",
    priceAsc: "价格从低到高",
    priceDesc: "价格从高到低",
    ratingDesc: "评分优先",
  },

  propertyType: {
    APARTMENT: "公寓",
    HOUSE: "独栋住宅",
    HOTEL: "酒店",
    VILLA: "别墅",
    LOFT: "LOFT",
    GUESTHOUSE: "民宿",
    CABIN: "木屋",
  },

  listing: {
    bedrooms: "{count} 间卧室",
    beds: "{count} 张床",
    maxGuests: "可住 {count} 人",
    save: "收藏房源",
    manageSave: "管理收藏",
    intro: "房源介绍",
    amenities: "房源设施",
    location: "位置信息",
    locationPrivacy: "出于隐私考虑，地图显示的是街区位置而非门牌号",
    coordinates: "经纬度 {lat}, {lng}",
    weather: "当地天气",
    host: "房东",
    showAllPhotos: "查看全部照片",
    notFound: "房源不存在",
  },

  booking: {
    title: "预订",
    checkIn: "入住",
    checkOut: "退房",
    selectDates: "选择日期",
    guests: "房客",
    guestsMax: "{count} 位 · 最多 {max} 人",
    reserve: "确认预订",
    reserveWithDates: "选择日期后预订",
    reserving: "正在预订…",
    pickDatesFirst: "请先选择入住与退房日期",
    tooManyGuests: "该房源最多可住 {max} 人",
    loginFirst: "请先登录后再预订",
    totalNights: "共 {count} 晚",
    roomLine: "{price} × {nights} 晚",
    cleaningFee: "清洁费",
    serviceFee: "服务费",
    total: "总价",
    serverPriced: "价格由服务端重新计算，保证安全",
    demoNotice: "演示项目，不会产生真实扣款",
    bookFailed: "预订失败，请稍后重试",
  },

  houseRules: {
    title: "入住须知",
    checkInTime: "入住时间",
    checkOutTime: "退房时间",
    afterCheckIn: "之后可随时入住",
    beforeCheckOut: "之前请完成退房",
    selfCheckIn: "入住当天房东会发送门锁密码与到达指引，无需现场交接钥匙。",
    rules: "入住守则",
    rulesCount: "{count} 条",
    notes: "其他须知",
    summary: "{checkIn} 入住 · {checkOut} 退房",
    agreement: "预订即表示你同意以上守则。如遇特殊情况请提前与房东沟通，大部分情况都可以协商。",
    view: "查看入住须知",
  },

  reviews: {
    title: "房客评价",
    summaryLine: "{rating} 分 · {count} 条",
    none: "暂无评价",
    stored: "{count} 条本站评价",
    stars: "{count} 星",
    seededNote: "房源历史评分 {rating} 分，来自 {count} 条早期评价（演示数据，无逐条记录）。",
    loginPrompt: "登录后可以发表评价，评价会保存到账号里。",
    alreadyReviewed: "你已经评价过这套房源。",
    editMine: "编辑我的评价",
    write: "写下你的评价",
    rating: "评分",
    ratingValue: "{count} 星",
    placeholder: "住得怎么样？位置、卫生、房东沟通、周边环境……",
    submit: "提交评价",
    saveEdit: "保存修改",
    mine: "我的评价",
    empty: "还没有人评价这套房源，来写第一条吧。",
    submitted: "评价已提交",
    saved: "评价已保存",
    deleted: "评价已删除",
    persisted: "下次登录依然可以看到你的评价。",
    failed: "提交失败，请稍后重试",
    deleteFailed: "删除失败，请稍后重试",
    delete: "删除评价",
    editLabel: "编辑评价",
  },

  wishlist: {
    title: "心愿单",
    addTo: "加入心愿单",
    create: "新建心愿单",
    name: "心愿单名称",
    empty: "还没有收藏的房源",
    loginPrompt: "登录后即可收藏房源",
    saved: "已加入心愿单",
  },

  trips: {
    title: "我的行程",
    empty: "还没有行程订单",
    pending: "待支付",
    confirmed: "已确认",
    cancelled: "已取消",
    cancelBooking: "取消订单",
  },

  profile: {
    title: "个人主页",
    subtitle: "管理你的公开资料与账号安全",
    publicInfo: "公开资料",
    chooseAvatar: "选择头像",
    presetCount: "{count} 个预设",
    nickname: "昵称",
    avatarUrl: "头像地址（可选）",
    cover: "主页背景",
    coverCustom: "或使用自定义背景图",
    security: "账号安全",
    currentPassword: "当前密码",
    newPassword: "新密码",
    confirmPassword: "确认新密码",
    changePassword: "修改密码",
    saveProfile: "保存资料",
    updated: "资料已更新",
    unsaved: "有未保存的修改",
    undo: "撤销修改",
    personalisation: "个性化主页",
    tags: "自定义标签",
    hobbies: "生活爱好",
    dreamDestinations: "心仪地点",
    visitedPlaces: "已旅行地点展柜",
  },

  map: {
    attribution: "地图数据 © Esri · 缩放级别 {zoom}",
    open: "在地图中打开",
    zoomIn: "放大地图",
    zoomOut: "缩小地图",
    unavailable: "地图暂时无法加载",
    loading: "正在加载地图…",
  },

  weather: {
    title: "当地天气",
    forecast: "未来 5 天",
    humidity: "湿度",
    wind: "风速",
    feelsLike: "体感",
    provider: "数据来自 Open-Meteo",
  },

  footer: {
    tagline: "AI 驱动的住宿预订演示项目",
    product: "产品",
    about: "关于",
    techStack: "技术栈",
    disclaimer: "演示项目，房源与价格均为模拟数据，不产生真实交易。",
  },

  locale: {
    label: "语言",
    switchTo: "切换到 {name}",
    changed: "语言已切换为 {name}",
  },

  agent: {
    title: "AI 旅行助手",
    subtitle: "用一句话说清需求，剩下的交给 AI",
    placeholder: "例如：帮我找东京市中心、能住 4 人、靠近地铁的公寓",
    clear: "清空",
    send: "发送",
    thinking: "思考中…",
    loginHint: "登录后可以使用收藏类工具",
  },
} as const;

/**
 * The dictionary *shape*: the same key tree as zh-CN, but every leaf widened to
 * `string`.
 *
 * `typeof zhCN` without this would carry literal types (`"搜索"`), so no
 * translation could ever satisfy it. Widening keeps the two properties that
 * matter: a locale missing a key is a compile error, and a locale with an extra
 * key is too.
 */
export type Dictionary = {
  [K in keyof typeof zhCN]: {
    [P in keyof (typeof zhCN)[K]]: string;
  };
};
