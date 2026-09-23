/**
 * Amenity catalog.
 *
 * Seeded into the `Amenity` table and used by the UI to resolve an icon for
 * each amenity name. `icon` values are lucide-react export names.
 */
export type AmenityDef = {
  name: string;
  icon: string;
  category: string;
};

export const AMENITY_CATALOG: AmenityDef[] = [
  { name: "无线网络", icon: "Wifi", category: "基础" },
  { name: "厨房", icon: "CookingPot", category: "基础" },
  { name: "空调", icon: "AirVent", category: "基础" },
  { name: "暖气", icon: "Flame", category: "基础" },
  { name: "洗衣机", icon: "WashingMachine", category: "基础" },
  { name: "电视", icon: "Tv", category: "娱乐" },
  { name: "专用办公区", icon: "Laptop", category: "办公" },
  { name: "熨斗", icon: "Shirt", category: "基础" },
  { name: "吹风机", icon: "Wind", category: "卫浴" },
  { name: "热水", icon: "Droplets", category: "卫浴" },
  { name: "浴缸", icon: "Bath", category: "卫浴" },
  { name: "游泳池", icon: "Waves", category: "特色" },
  { name: "健身房", icon: "Dumbbell", category: "特色" },
  { name: "阳台", icon: "Sun", category: "特色" },
  { name: "花园", icon: "Trees", category: "特色" },
  { name: "烧烤设备", icon: "Beef", category: "特色" },
  { name: "免费停车", icon: "CircleParking", category: "出行" },
  { name: "电梯", icon: "ArrowUpDown", category: "出行" },
  { name: "地铁附近", icon: "TrainFront", category: "出行" },
  { name: "含早餐", icon: "Coffee", category: "餐饮" },
  { name: "自助入住", icon: "KeyRound", category: "政策" },
  { name: "可带宠物", icon: "PawPrint", category: "政策" },
  { name: "长租可议", icon: "CalendarClock", category: "政策" },
  { name: "婴儿床", icon: "Baby", category: "家庭" },
  { name: "烟雾报警器", icon: "BellRing", category: "安全" },
  { name: "一氧化碳报警器", icon: "ShieldAlert", category: "安全" },
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
