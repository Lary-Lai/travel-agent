/**
 * Weather service.
 *
 * Uses Open-Meteo, which needs no API key, so the demo works out of the box.
 * Coordinates come from `lib/cities.ts`, which already stores them, so a city
 * name is all a caller needs.
 *
 * Weather changes slowly, so responses are cached in-process. On a provider
 * failure we prefer a stale cached reading over showing nothing.
 */
import { CITIES, countryLabel, findCity } from "../lib/cities";
import { describeWeatherCode, weatherAdvice, weatherTipKeys } from "../lib/weather";
import type { CityWeather, WeatherDay } from "../types";

// Re-exported so callers can import the weather shapes from either place.
export type { CityWeather, WeatherCurrent, WeatherDay } from "../types";

const PROVIDER = "https://api.open-meteo.com/v1/forecast";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const FORECAST_DAYS = 5;

type CacheEntry = { at: number; data: CityWeather };

const cache = new Map<string, CacheEntry>();

/** Provider payload shape (only the fields we request). */
type OpenMeteoResponse = {
  timezone?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    is_day?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
  };
};

function buildUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
  });
  return `${PROVIDER}?${params.toString()}`;
}

function shape(
  meta: { name: string; nameZh: string; country: string; latitude: number; longitude: number },
  payload: OpenMeteoResponse,
  flags: { cached: boolean; stale: boolean },
): CityWeather {
  const current = payload.current ?? {};
  const isDay = current.is_day !== 0;
  const currentDescriptor = describeWeatherCode(current.weather_code ?? 0, isDay);

  const daily = payload.daily ?? {};
  const dates = daily.time ?? [];

  const forecast: WeatherDay[] = dates.map((date, index) => {
    const code = daily.weather_code?.[index] ?? 0;
    const descriptor = describeWeatherCode(code, true);
    return {
      date,
      weatherCode: code,
      kind: descriptor.kind,
      description: descriptor.label,
      icon: descriptor.icon,
      maxTemperature: Math.round(daily.temperature_2m_max?.[index] ?? 0),
      minTemperature: Math.round(daily.temperature_2m_min?.[index] ?? 0),
      precipitationProbability: Math.round(daily.precipitation_probability_max?.[index] ?? 0),
    };
  });

  const temperature = Math.round(current.temperature_2m ?? 0);
  const windSpeed = Math.round(current.wind_speed_10m ?? 0);

  return {
    city: meta.name,
    cityLabel: meta.nameZh,
    countryLabel: countryLabel(meta.country),
    latitude: meta.latitude,
    longitude: meta.longitude,
    timezone: payload.timezone ?? "UTC",
    current: {
      temperature,
      apparentTemperature: Math.round(current.apparent_temperature ?? temperature),
      humidity: Math.round(current.relative_humidity_2m ?? 0),
      windSpeed,
      weatherCode: current.weather_code ?? 0,
      kind: currentDescriptor.kind,
      description: currentDescriptor.label,
      icon: currentDescriptor.icon,
      isDay,
      observedAt: current.time ?? new Date().toISOString(),
    },
    forecast,
    advice: weatherAdvice({
      temperature,
      windSpeed,
      kind: currentDescriptor.kind,
      precipitationProbability: forecast[0]?.precipitationProbability ?? 0,
    }),
    // The same decision as keys, so the client can render it in any language.
    adviceKeys: weatherTipKeys({
      temperature,
      windSpeed,
      kind: currentDescriptor.kind,
      precipitationProbability: forecast[0]?.precipitationProbability ?? 0,
    }),
    fetchedAt: new Date().toISOString(),
    provider: "Open-Meteo",
    cached: flags.cached,
    stale: flags.stale,
  };
}

async function fetchWeather(
  meta: { name: string; nameZh: string; country: string; latitude: number; longitude: number },
): Promise<CityWeather> {
  const response = await fetch(buildUrl(meta.latitude, meta.longitude), {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`weather provider returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as OpenMeteoResponse;
  if (!payload.current) throw new Error("weather provider returned no current conditions");

  return shape(meta, payload, { cached: false, stale: false });
}

/**
 * Current conditions + a short forecast for a city.
 *
 * Returns null when the city is unknown or the provider cannot be reached and
 * nothing is cached — callers should then simply hide the weather card.
 */
export async function getCityWeather(cityName: string): Promise<CityWeather | null> {
  const city = findCity(cityName);
  if (!city) return null;

  const key = city.name;
  const hit = cache.get(key);
  const now = Date.now();

  if (hit && now - hit.at < CACHE_TTL_MS) {
    return { ...hit.data, cached: true, stale: false };
  }

  try {
    const fresh = await fetchWeather(city);
    cache.set(key, { at: now, data: fresh });
    return fresh;
  } catch (error) {
    console.error(`[weather] ${key} lookup failed:`, error instanceof Error ? error.message : error);

    // Serve a stale reading rather than an empty card.
    if (hit) return { ...hit.data, cached: true, stale: true };
    return null;
  }
}

/** Every supported city's weather, for the destination overview. */
export async function getAllCityWeather(): Promise<CityWeather[]> {
  const results = await Promise.all(CITIES.map((city) => getCityWeather(city.name)));
  return results.filter((entry): entry is CityWeather => entry !== null);
}
