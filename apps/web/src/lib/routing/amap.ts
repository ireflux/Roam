import "server-only";
import { RoutingError, type RouteResult, type RoutingProvider } from "@/lib/routing/provider";
import type { Mode, Position, SegmentPart } from "@roam/core";

const BASE = "https://restapi.amap.com";
const TIMEOUT_MS = 10_000;

type AmapPath = { distance?: string; duration?: string; steps?: Array<{ polyline?: string }> };
type AmapDirectionResponse = { status?: string; info?: string; route?: { paths?: AmapPath[] }; data?: { paths?: AmapPath[] }; errcode?: number; errmsg?: string };

type TransitSegment = {
  walking?: { polyline?: string };
  bus?: { buslines?: Array<{ polyline?: string; name?: string }> };
};
type AmapTransitResponse = {
  status?: string;
  info?: string;
  route?: {
    transits?: Array<{
      distance?: string;
      duration?: string;
      segments?: TransitSegment[];
    }>;
  };
};
type AmapRegeoResponse = {
  status?: string;
  info?: string;
  regeocode?: {
    addressComponent?: { city?: string[] | string; adcode?: string; province?: string };
  };
};

function coordinates(value: string | undefined): Position[] {
  if (!value) return [];
  return value.split(";").flatMap((pair) => {
    const [lng, lat] = pair.split(",").map(Number);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [[lng, lat] as Position] : [];
  });
}

function position(value: Position): string {
  return `${value[0].toFixed(6)},${value[1].toFixed(6)}`;
}

function key(): string {
  const value = process.env.AMAP_WEB_SERVICE_KEY;
  if (!value) throw new RoutingError("未配置 AMAP_WEB_SERVICE_KEY", "config");
  return value;
}

// 进程内城市缓存（regeo 一次后可复用），key 近似到 ~0.1m 精度。
// 只缓存成功响应（status === "1"）；错误响应抛错且不写入，避免永久负缓存。
const CITY_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const CITY_CACHE_MAX = 2_000;
const cityCache = new Map<string, { city: string; ts: number }>();
async function reverseCity(pos: Position): Promise<string> {
  const cacheKey = `${pos[0].toFixed(6)},${pos[1].toFixed(6)}`;
  const hit = cityCache.get(cacheKey);
  if (hit) {
    if (Date.now() - hit.ts <= CITY_CACHE_TTL_MS) return hit.city;
    cityCache.delete(cacheKey);
  }

  const url = new URL(`${BASE}/v3/geocode/regeo`);
  url.searchParams.set("key", key());
  url.searchParams.set("location", position(pos));
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new RoutingError("城市识别服务暂不可用", "upstream");
  }
  if (!response.ok) throw new RoutingError(`城市识别服务返回 ${response.status}`, "upstream");
  const data = await response.json() as AmapRegeoResponse;
  if (data.status !== "1") {
    // 上游业务错误（如 key 无效/配额耗尽）：抛错且不缓存，下次请求重试。
    throw new RoutingError(data.info ?? "城市识别服务返回异常", "upstream");
  }
  const component = data.regeocode?.addressComponent;
  // 直辖市可能在 city 数组里；取其一后回退到 adcode（6 位行政区划码，高德公交/生活接口均可接受）
  const city = Array.isArray(component?.city) ? component!.city[0] : component?.city;
  const resolved = city || component?.adcode || "";
  // 合法的空结果（无 city 也无 adcode）也缓存（带 TTL），这不是错误。
  cityCache.set(cacheKey, { city: resolved, ts: Date.now() });
  if (cityCache.size > CITY_CACHE_MAX) {
    const oldest = cityCache.keys().next().value as string;
    cityCache.delete(oldest);
  }
  return resolved;
}

/** 公交/地铁：分段解析，公交实线 + 步行虚线，便于地图分段渲染。 */
function parseTransit(data: AmapTransitResponse): RouteResult {
  const transit = data.route?.transits?.[0];
  const parts: SegmentPart[] = [];
  for (const segment of transit?.segments ?? []) {
    if (segment.walking?.polyline) {
      const coords = coordinates(segment.walking.polyline);
      if (coords.length >= 2) parts.push({ kind: "walking", coordinates: coords });
    }
    const busPolyline = segment.bus?.buslines?.[0]?.polyline;
    if (busPolyline) {
      const coords = coordinates(busPolyline);
      if (coords.length >= 2) parts.push({ kind: "transit", coordinates: coords });
    }
  }
  const geometry = parts.flatMap((p) => p.coordinates);
  if (parts.length === 0 || geometry.length < 2) throw new RoutingError("高德未返回可用公交方案", "no_route");
  return {
    geometry,
    distanceM: Number(transit?.distance) || 0,
    durationMin: Math.max(1, Math.round((Number(transit?.duration) || 0) / 60)),
    parts,
  };
}

export class AmapRoutingProvider implements RoutingProvider {
  async route(mode: Mode, from: Position, to: Position): Promise<RouteResult> {
    if (mode === "transit") return this.transit(from, to);

    const path = mode === "driving"
      ? "/v3/direction/driving"
      : mode === "walking"
        ? "/v3/direction/walking"
        : "/v4/direction/bicycling";
    const url = new URL(`${BASE}${path}`);
    url.searchParams.set("key", key());
    url.searchParams.set("origin", position(from));
    url.searchParams.set("destination", position(to));
    if (mode === "driving") url.searchParams.set("strategy", "10");

    let response: Response;
    try {
      response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new RoutingError("高德路线服务暂不可用", "upstream");
    }
    if (!response.ok) throw new RoutingError(`高德路线服务返回 ${response.status}`, "upstream");
    const data = await response.json() as AmapDirectionResponse;
    if (data.status !== "1" && data.errcode !== 0) {
      const message = data.info ?? data.errmsg ?? "无法规划该路线";
      throw new RoutingError(message, /DAILY_QUERY_OVER_LIMIT|USER_DAILY_QUERY_OVER_LIMIT/.test(message) ? "quota" : "no_route");
    }
    const result = data.route?.paths?.[0] ?? data.data?.paths?.[0];
    const geometry = result?.steps?.flatMap((step) => coordinates(step.polyline));
    if (!result || !geometry || geometry.length < 2) throw new RoutingError("高德未返回可用路线", "no_route");
    return {
      geometry,
      distanceM: Number(result.distance) || 0,
      durationMin: Math.max(1, Math.round((Number(result.duration) || 0) / 60)),
    };
  }

  /** 公交/地铁综合方案（v3/direction/transit/integrated）。公交必须明确城市，
   *  由起终点坐标逆地理编码推断，跨城市不支持 -> no_route 降级。 */
  private async transit(from: Position, to: Position): Promise<RouteResult> {
    const [city, cityd] = await Promise.all([reverseCity(from), reverseCity(to)]);
    if (!city || !cityd) throw new RoutingError("无法识别起点或终点城市，公交暂不可用", "no_route");
    if (city !== cityd) throw new RoutingError("跨城市暂不支持公交/地铁", "no_route");

    const url = new URL(`${BASE}/v3/direction/transit/integrated`);
    url.searchParams.set("key", key());
    url.searchParams.set("origin", position(from));
    url.searchParams.set("destination", position(to));
    url.searchParams.set("city", city);
    url.searchParams.set("cityd", cityd);
    url.searchParams.set("strategy", "0");

    let response: Response;
    try {
      response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new RoutingError("高德公交服务暂不可用", "upstream");
    }
    if (!response.ok) throw new RoutingError(`高德公交服务返回 ${response.status}`, "upstream");
    const data = await response.json() as AmapTransitResponse;
    if (data.status !== "1") {
      const message = data.info ?? "无法规划该公交路线";
      throw new RoutingError(message, /DAILY_QUERY_OVER_LIMIT|USER_DAILY_QUERY_OVER_LIMIT/.test(message) ? "quota" : "no_route");
    }
    return parseTransit(data);
  }
}