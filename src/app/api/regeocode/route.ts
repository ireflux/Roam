import { NextResponse } from "next/server";
import { regeocode } from "@/lib/lbs";

// 逆地理编码：坐标 → 地址 / 最近 POI 名称 / 城市。
// 用于「点击地图添加站点」自动命名，以及天气、公交的城市推断。
// 走服务端 AMAP_WEB_SERVICE_KEY，不暴露密钥；结果经 lbs.ts 进程缓存。

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lng = Number(params.get("lng"));
  const lat = Number(params.get("lat"));
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return NextResponse.json({ error: "bad_request", message: "lng/lat 无效" }, { status: 400 });
  }
  try {
    const info = await regeocode(lng, lat);
    return NextResponse.json(
      { address: info.address, name: info.name, city: info.city },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "map_service_unavailable";
    if (message === "map_service_not_configured") {
      return NextResponse.json({ error: "map_service_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ error: message === "amap_error" ? "amap_error" : "map_service_unavailable" }, { status: 502 });
  }
}