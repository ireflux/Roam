import "server-only";
import { RoutingError, type RouteResult, type RoutingProvider } from "@/lib/routing/provider";
import type { Mode, Position } from "@/lib/types";

const BASE = "https://restapi.amap.com";
const TIMEOUT_MS = 10_000;

type AmapPath = { distance?: string; duration?: string; steps?: Array<{ polyline?: string }> };
type AmapDirectionResponse = { status?: string; info?: string; route?: { paths?: AmapPath[] }; data?: { paths?: AmapPath[] }; errcode?: number; errmsg?: string };

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

export class AmapRoutingProvider implements RoutingProvider {
  async route(mode: Mode, from: Position, to: Position): Promise<RouteResult> {
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
}
