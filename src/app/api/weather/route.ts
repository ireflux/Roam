import { NextResponse } from "next/server";
import { liveWeather, regeocode, weatherForecast } from "@/lib/lbs";

// 天气接口：
// - 无 date     → 实时天气（编辑器/分享页按「每日首个站点」坐标调用）
// - 有 date     → 城市多日预报中匹配该日期的预报；超出预报窗口返回 forecast: null
// 服务端缓存：实时 10 分钟、预报 1 小时，避免高频访问消耗配额。

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let city = params.get("city")?.trim();
  const lng = Number(params.get("lng"));
  const lat = Number(params.get("lat"));
  const date = params.get("date")?.trim() ?? "";

  try {
    if (!city) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return NextResponse.json({ error: "bad_request", message: "需要 city 或 lng/lat" }, { status: 400 });
      }
      const info = await regeocode(lng, lat);
      city = info.city;
      if (!city) {
        return NextResponse.json({ error: "no_city", message: "无法识别城市" }, { status: 422 });
      }
    }

    // 有 date：查该日预报；预报窗口由高德返回的 casts 决定（通常今天起 3 天）
    if (date) {
      const forecast = await weatherForecast(city);
      if (!forecast) {
        return NextResponse.json({ error: "no_weather", message: "该城市暂无天气数据" }, { status: 422 });
      }
      const day = forecast.days.find((d) => d.date === date) ?? null;
      return NextResponse.json(
        { city: forecast.city, forecast: day ? { ...day, city: forecast.city } : null },
        { headers: { "Cache-Control": "private, max-age=300" } },
      );
    }

    const live = await liveWeather(city);
    if (!live) return NextResponse.json({ error: "no_weather", message: "该城市暂无天气数据" }, { status: 422 });
    return NextResponse.json(
      {
        city: live.city,
        weather: live.weather,
        temperature: live.temperature,
        windDirection: live.windDirection,
        windPower: live.windPower,
        humidity: live.humidity,
      },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "map_service_unavailable";
    if (message === "map_service_not_configured") {
      return NextResponse.json({ error: "map_service_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "map_service_unavailable" }, { status: 502 });
  }
}