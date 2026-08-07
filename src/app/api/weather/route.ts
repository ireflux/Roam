import { NextResponse } from "next/server";
import { liveWeather, regeocode } from "@/lib/lbs";

// 实时天气：优先按 city（城市名或 adcode）查询；仅传 lng/lat 时先逆地理编码取城市。
// 编辑器 / 分享页按「每日首个站点」坐标调用，服务端有 10 分钟缓存，避免高频访问消耗配额。

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let city = params.get("city")?.trim();
  const lng = Number(params.get("lng"));
  const lat = Number(params.get("lat"));

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