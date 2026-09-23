import type { NextRequest } from "next/server";

import { badRequest, handler, notFound, ok } from "@/lib/http";
import { getAllCityWeather, getCityWeather } from "@/server/weather.service";

/**
 * GET /api/weather?city=Tokyo   -> one city's current conditions + forecast
 * GET /api/weather?all=1        -> every supported city
 *
 * Public: weather is not user-specific data.
 */
export const GET = handler(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;

  if (params.get("all")) {
    const cities = await getAllCityWeather();
    return ok({ cities });
  }

  const city = params.get("city")?.trim();
  if (!city) throw badRequest("请提供 city 查询参数，例如 /api/weather?city=Tokyo");

  const weather = await getCityWeather(city);
  if (!weather) {
    throw notFound(`暂时无法获取「${city}」的天气，可能是不支持的城市或天气服务不可用`);
  }

  return ok({ weather });
});
