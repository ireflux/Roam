import { NextResponse } from "next/server";

type AmapPoi = { name?: string; address?: string; location?: string; cityname?: string };

export async function GET(request: Request) {
  const keyword = new URL(request.url).searchParams.get("q")?.trim();
  if (!keyword || keyword.length < 2 || keyword.length > 100) return NextResponse.json({ pois: [] });
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key) return NextResponse.json({ error: "map_service_not_configured" }, { status: 503 });
  const url = new URL("https://restapi.amap.com/v3/place/text");
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", keyword);
  url.searchParams.set("citylimit", "false");
  url.searchParams.set("offset", "6");
  url.searchParams.set("page", "1");
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("upstream");
    const data = await response.json() as { status?: string; pois?: AmapPoi[] };
    if (data.status !== "1") throw new Error("amap_error");
    const pois = (data.pois ?? []).flatMap((poi) => {
      const [lng, lat] = poi.location?.split(",").map(Number) ?? [];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
      return [{ name: poi.name ?? "未命名地点", address: [poi.address, poi.cityname].filter(Boolean).join(" · "), lng, lat }];
    });
    return NextResponse.json({ pois }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ error: "map_service_unavailable" }, { status: 502 });
  }
}
