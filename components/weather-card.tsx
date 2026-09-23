import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Moon,
  Sun,
  Wind,
} from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import { weekdayLabel } from "@/lib/weather";
import type { CityWeather } from "@/types";

/**
 * Explicit icon registry — a dynamic `lucide-react[name]` lookup would pull the
 * entire icon set into the bundle.
 */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
};

function WeatherIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? CloudSun;
  return <Icon className={className} />;
}

/**
 * Weather for the selected city.
 *
 * Presentational and server-renderable (no hooks), so the listing page can
 * render it on the server and it costs the client nothing.
 */
export function WeatherCard({
  weather,
  variant = "full",
  className,
}: {
  weather: CityWeather | null;
  variant?: "full" | "compact";
  className?: string;
}) {
  if (!weather) return null;

  const { current } = weather;

  // ------------------------------------------------------------- compact strip
  if (variant === "compact") {
    return (
      <div
        className={cn(
          "bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-sm",
          className,
        )}
      >
        <span className="flex items-center gap-2 font-medium">
          <WeatherIcon name={current.icon} className="size-4" />
          {weather.cityLabel} {current.temperature}°C
        </span>
        <span className="text-muted-foreground">{current.description}</span>
        <span className="text-muted-foreground text-xs">
          体感 {current.apparentTemperature}°C · 湿度 {current.humidity}%
        </span>
        <span className="text-muted-foreground ml-auto text-xs">{weather.advice}</span>
      </div>
    );
  }

  // -------------------------------------------------------------- full card
  return (
    <section className={cn("overflow-hidden rounded-2xl border", className)}>
      <div className="from-primary/10 flex items-start justify-between gap-3 bg-gradient-to-br to-transparent p-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium">
            当前天气 · {weather.cityLabel}
          </p>
          <div className="mt-1.5 flex items-end gap-2">
            <span className="text-3xl font-semibold tabular-nums">{current.temperature}°</span>
            <span className="pb-1 text-sm">{current.description}</span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            体感 {current.apparentTemperature}°C · 湿度 {current.humidity}% · 风速{" "}
            {current.windSpeed} km/h
          </p>
        </div>

        <WeatherIcon name={current.icon} className="text-primary size-12 shrink-0" />
      </div>

      {/* -------------------------------------------------------- forecast */}
      {weather.forecast.length > 0 ? (
        <div className="grid grid-cols-5 divide-x border-t">
          {weather.forecast.map((day, index) => (
            <div key={day.date} className="flex flex-col items-center gap-1 px-1 py-3">
              <span className="text-muted-foreground text-[11px]">
                {weekdayLabel(day.date, index)}
              </span>
              <WeatherIcon name={day.icon} className="size-4" />
              <span className="text-xs tabular-nums">
                <span className="font-medium">{day.maxTemperature}°</span>
                <span className="text-muted-foreground"> {day.minTemperature}°</span>
              </span>
              {day.precipitationProbability > 0 ? (
                <span className="flex items-center gap-0.5 text-[10px] text-sky-600">
                  <Droplets className="size-2.5" />
                  {day.precipitationProbability}%
                </span>
              ) : (
                <span className="text-[10px]">&nbsp;</span>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* ---------------------------------------------------------- advice */}
      <div className="text-muted-foreground flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs">
        <span className="flex items-center gap-1.5">
          <Wind className="size-3.5" />
          {weather.advice}
        </span>
        <span className="shrink-0 text-[10px]">
          {weather.provider}
          {weather.stale ? " · 缓存" : weather.cached ? " · 缓存" : ""}
        </span>
      </div>
    </section>
  );
}
