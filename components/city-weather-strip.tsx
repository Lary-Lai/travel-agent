"use client";

import { useQuery } from "@tanstack/react-query";

import { WeatherCard } from "@/components/weather-card";
import { api } from "@/lib/api";

/**
 * Weather for the city currently being searched.
 *
 * Client-side on purpose: the search page's filters live in the URL and change
 * without a full reload, so the weather follows the selected city reactively.
 */
export function CityWeatherStrip({ city }: { city: string }) {
  const { data } = useQuery({
    queryKey: ["weather", city],
    queryFn: () => api.getCityWeather(city),
    enabled: Boolean(city),
    // The server caches for 15 minutes; avoid refetching on every filter change.
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return <WeatherCard weather={data?.weather ?? null} variant="compact" />;
}
