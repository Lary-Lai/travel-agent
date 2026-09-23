/**
 * Amenity catalog.
 *
 * Seeded into the `Amenity` table and used by the UI to resolve an icon for
 * each amenity name. `icon` values are lucide-react export names.
 *
 * `description` powers the "click an amenity to see what it means" dialog on
 * the listing detail page.
 */
export type AmenityDef = {
  name: string;
  icon: string;
  category: string;
  description: string;
};

export const AMENITY_CATALOG: AmenityDef[] = [
  {
    name: "无线网络",
    icon: "Wifi",
    category: "基础",
    description: "全屋覆盖高速 Wi-Fi，可满足视频会议与多台设备同时在线。",
  },
  {
    name: "厨房",
    icon: "CookingPot",
    category: "基础",
    description: "配备灶台、冰箱、微波炉与基本厨具，可以自己做饭。",
  },
  {
    name: "空调",
    icon: "AirVent",
    category: "基础",
    description: "主要房间均配有空调，可自行调节温度。",
  },
  {
    name: "暖气",
    icon: "Flame",
    category: "基础",
    description: "冬季提供暖气，室内可保持舒适温度。",
  },
  {
    name: "洗衣机",
    icon: "WashingMachine",
    category: "基础",
    description: "房源内配有洗衣机，长住期间可以自行洗衣。",
  },
  {
    name: "电视",
    icon: "Tv",
    category: "娱乐",
    description: "客厅配有电视，可观看常规频道。",
  },
  {
    name: "专用办公区",
    icon: "Laptop",
    category: "办公",
    description: "设有书桌与座椅，适合远程办公或处理工作。",
  },
  {
    name: "熨斗",
    icon: "Shirt",
    category: "基础",
    description: "提供熨斗与熨衣板，方便整理正装。",
  },
  {
    name: "吹风机",
    icon: "Wind",
    category: "卫浴",
    description: "卫生间提供吹风机，无需自带。",
  },
  {
    name: "热水",
    icon: "Droplets",
    category: "卫浴",
    description: "24 小时热水供应，随时可以洗澡。",
  },
  {
    name: "浴缸",
    icon: "Bath",
    category: "卫浴",
    description: "卫生间配有浴缸，可以泡澡放松。",
  },
  {
    name: "游泳池",
    icon: "Waves",
    category: "特色",
    description: "房源内或所在小区配有游泳池。",
  },
  {
    name: "健身房",
    icon: "Dumbbell",
    category: "特色",
    description: "楼内或所在小区配有健身房，可免费使用。",
  },
  {
    name: "阳台",
    icon: "Sun",
    category: "特色",
    description: "配有阳台，可以在此休息、喝茶或用餐。",
  },
  {
    name: "花园",
    icon: "Trees",
    category: "特色",
    description: "带花园或庭院，适合户外活动与孩子玩耍。",
  },
  {
    name: "烧烤设备",
    icon: "Beef",
    category: "特色",
    description: "提供烧烤炉具，可在户外烧烤聚餐。",
  },
  {
    name: "免费停车",
    icon: "CircleParking",
    category: "出行",
    description: "房源提供免费停车位，适合自驾出行。",
  },
  {
    name: "电梯",
    icon: "ArrowUpDown",
    category: "出行",
    description: "楼内配有电梯，搬运行李更方便。",
  },
  {
    name: "地铁附近",
    icon: "TrainFront",
    category: "出行",
    description: "步行即可到达地铁或轨道交通站，出行便利。",
  },
  {
    name: "含早餐",
    icon: "Coffee",
    category: "餐饮",
    description: "房价包含每日早餐，通常为自助或套餐形式。",
  },
  {
    name: "自助入住",
    icon: "KeyRound",
    category: "政策",
    description: "通过密码锁或钥匙盒自助入住，无需等待房东交接。",
  },
  {
    name: "可带宠物",
    icon: "PawPrint",
    category: "政策",
    description: "允许携带宠物入住，建议提前告知房东。",
  },
  {
    name: "长租可议",
    icon: "CalendarClock",
    category: "政策",
    description: "支持较长租期，可与房东协商更优惠的价格。",
  },
  {
    name: "婴儿床",
    icon: "Baby",
    category: "家庭",
    description: "可提供婴儿床，适合带婴幼儿出行。",
  },
  {
    name: "烟雾报警器",
    icon: "BellRing",
    category: "安全",
    description: "房间内安装烟雾报警器，属于安全必备设施。",
  },
  {
    name: "一氧化碳报警器",
    icon: "ShieldAlert",
    category: "安全",
    description: "房间内安装一氧化碳报警器，使用燃气设备时更安全。",
  },
];

export const AMENITY_BY_NAME = new Map(AMENITY_CATALOG.map((a) => [a.name, a]));

/** Amenities surfaced first on the detail page, in this order. */
export const FEATURED_AMENITIES = [
  "无线网络",
  "厨房",
  "空调",
  "洗衣机",
  "电视",
  "专用办公区",
  "地铁附近",
  "免费停车",
];

/**
 * Photo angles shown for each listing.
 *
 * The demo uses stock photography, so these captions describe the *view* each
 * image represents rather than a verified shot of the real property.
 */
const RESIDENTIAL_ANGLES = ["客厅", "主卧", "厨房", "卫生间", "次卧", "阳台与周边"];
const HOTEL_ANGLES = ["客房", "卫浴", "公共区域", "早餐区", "建筑外观", "周边环境"];

export function galleryAnglesFor(propertyType: string): string[] {
  return propertyType === "HOTEL" ? HOTEL_ANGLES : RESIDENTIAL_ANGLES;
}
