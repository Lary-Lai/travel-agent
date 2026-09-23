/**
 * Weather vocabulary.
 *
 * Shared by the service (which maps provider codes to a description) and the UI
 * (which maps them to an icon), so both stay in sync.
 *
 * Codes follow the WMO scheme used by Open-Meteo.
 */

export type WeatherKind =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "freezing-rain"
  | "snow"
  | "showers"
  | "snow-showers"
  | "thunderstorm";

type WeatherDescriptor = {
  kind: WeatherKind;
  label: string;
  /** lucide-react export name. */
  icon: string;
};

/**
 * WMO code -> descriptor.
 * `:day` / `:night` variants only differ by icon, so the label is shared.
 */
const WMO: Record<number, WeatherDescriptor> = {
  0: { kind: "clear", label: "晴", icon: "Sun" },
  1: { kind: "mostly-clear", label: "大部晴朗", icon: "Sun" },
  2: { kind: "partly-cloudy", label: "局部多云", icon: "CloudSun" },
  3: { kind: "overcast", label: "阴", icon: "Cloud" },
  45: { kind: "fog", label: "有雾", icon: "CloudFog" },
  48: { kind: "fog", label: "雾凇", icon: "CloudFog" },
  51: { kind: "drizzle", label: "小毛毛雨", icon: "CloudDrizzle" },
  53: { kind: "drizzle", label: "毛毛雨", icon: "CloudDrizzle" },
  55: { kind: "drizzle", label: "大毛毛雨", icon: "CloudDrizzle" },
  56: { kind: "freezing-rain", label: "冻毛毛雨", icon: "CloudDrizzle" },
  57: { kind: "freezing-rain", label: "强冻毛毛雨", icon: "CloudDrizzle" },
  61: { kind: "rain", label: "小雨", icon: "CloudRain" },
  63: { kind: "rain", label: "中雨", icon: "CloudRain" },
  65: { kind: "rain", label: "大雨", icon: "CloudRain" },
  66: { kind: "freezing-rain", label: "冻雨", icon: "CloudRain" },
  67: { kind: "freezing-rain", label: "强冻雨", icon: "CloudRain" },
  71: { kind: "snow", label: "小雪", icon: "CloudSnow" },
  73: { kind: "snow", label: "中雪", icon: "CloudSnow" },
  75: { kind: "snow", label: "大雪", icon: "CloudSnow" },
  77: { kind: "snow", label: "雪粒", icon: "CloudSnow" },
  80: { kind: "showers", label: "小阵雨", icon: "CloudRain" },
  81: { kind: "showers", label: "阵雨", icon: "CloudRain" },
  82: { kind: "showers", label: "强阵雨", icon: "CloudRain" },
  85: { kind: "snow-showers", label: "小阵雪", icon: "CloudSnow" },
  86: { kind: "snow-showers", label: "阵雪", icon: "CloudSnow" },
  95: { kind: "thunderstorm", label: "雷阵雨", icon: "CloudLightning" },
  96: { kind: "thunderstorm", label: "雷阵雨伴冰雹", icon: "CloudLightning" },
  99: { kind: "thunderstorm", label: "强雷阵雨伴冰雹", icon: "CloudLightning" },
};

const UNKNOWN: WeatherDescriptor = { kind: "partly-cloudy", label: "未知", icon: "CloudSun" };

export function describeWeatherCode(code: number, isDay = true): WeatherDescriptor {
  const descriptor = WMO[code] ?? UNKNOWN;

  // Swap in night icons for the two clear-sky variants.
  if (!isDay) {
    if (descriptor.kind === "clear") return { ...descriptor, icon: "Moon" };
    if (descriptor.kind === "mostly-clear") return { ...descriptor, icon: "CloudMoon" };
  }

  return descriptor;
}

/** Short advice shown under the forecast, derived from the numbers we have. */
export function weatherAdvice(input: {
  temperature: number;
  precipitationProbability: number;
  windSpeed: number;
  kind: WeatherKind;
}): string {
  const tips: string[] = [];

  if (input.precipitationProbability >= 50 || ["rain", "showers", "thunderstorm", "drizzle"].includes(input.kind)) {
    tips.push("记得带伞");
  }
  if (input.kind === "snow" || input.kind === "snow-showers") tips.push("注意保暖防滑");
  if (input.temperature <= 5) tips.push("气温偏低，建议厚外套");
  else if (input.temperature >= 30) tips.push("天气炎热，注意补水");
  if (input.windSpeed >= 30) tips.push("风力较大");

  if (tips.length === 0) {
    return input.temperature >= 15 && input.temperature <= 26
      ? "天气舒适，适合外出游玩"
      : "天气尚可，适合出行";
  }
  return tips.join("，");
}

/** `2026-09-24` -> `周三` */
export function weekdayLabel(date: string, index: number): string {
  if (index === 0) return "今天";
  if (index === 1) return "明天";
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const parsed = new Date(`${date}T00:00:00Z`);
  return names[parsed.getUTCDay()] ?? date.slice(5);
}
